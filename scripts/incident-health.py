#!/usr/bin/env python3
"""Independent staging availability checks. No credentials, models, writes to APIs or raw diagnostics."""
import argparse
import concurrent.futures
import fcntl
import json
import os
from pathlib import Path
import re
import ssl
import stat
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

LIMIT = 65536
CHECKS = (
    ('api', 'https://verticals-staging.up.railway.app/health', 200, 'health'),
    ('api-ready', 'https://verticals-staging.up.railway.app/ready', 200, 'ready'),
    ('storefront', 'https://web-tienda-staging.up.railway.app/', 200, 'html'),
    ('admin', 'https://web-admin-staging-84b0.up.railway.app/', 200, 'html'),
    ('pos', 'https://web-pos-staging.up.railway.app/', 200, 'html'),
    ('superadmin', 'https://web-superadmin-staging.up.railway.app/', 200, 'html'),
    ('incident-auth', 'https://verticals-staging.up.railway.app/admin/incidents', 401, 'unauthorized'),
)
CHECK_IDS = frozenset(check[0] for check in CHECKS)
REASONS = {'http_status', 'invalid_json', 'invalid_health', 'invalid_ready', 'invalid_html',
           'response_too_large', 'transport_error', 'redirect_refused'}
FINDING_KEYS = {'version', 'checkId', 'firstSeen', 'lastSeen', 'occurrences', 'resolvedAt', 'reason', 'httpStatus'}


class RedirectRefused(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RedirectRefused()


def opener():
    # No proxy, authentication or cookie handlers; TLS certificate and hostname checks remain enabled.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                      urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def check_once(check, checked_at, make_opener=None):
    check_id, url, expected, kind = check
    result = {'checkId': check_id, 'status': 'failed', 'httpStatus': None,
              'expectedStatus': expected, 'checkedAt': checked_at, 'reason': 'transport_error'}
    try:
        transport = (make_opener or opener)()
        request = urllib.request.Request(url, headers={'User-Agent': 'Gaes-Staging-Health/1.0'}, method='GET')
        try:
            response = transport.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status_code = response.code
            if type(status_code) is not int or not 100 <= status_code <= 599:
                return result
            result['httpStatus'] = status_code
            if status_code != expected:
                result['reason'] = 'http_status'
                return result
            if kind == 'unauthorized':
                result.update(status='ok', reason=None)
                return result
            # HTML can legitimately exceed the bound; only its prefix is inspected and retained nowhere.
            body = response.read(LIMIT)
            if kind == 'html':
                if not re.match(rb'\s*(?:<!doctype\s+html\b|<html(?:\s|>))', body[:4096].removeprefix(b'\xef\xbb\xbf'), re.IGNORECASE):
                    result['reason'] = 'invalid_html'
                    return result
            else:
                if len(body) >= LIMIT:
                    result['reason'] = 'response_too_large'
                    return result
                try:
                    data = json.loads(body)
                except (ValueError, UnicodeError):
                    result['reason'] = 'invalid_json'
                    return result
                if not isinstance(data, dict) or data.get('status') != ('ok' if kind == 'health' else 'ready'):
                    result['reason'] = 'invalid_health' if kind == 'health' else 'invalid_ready'
                    return result
                if kind == 'ready' and (not isinstance(data.get('checks'), dict) or data['checks'].get('masterDb') != 'ok'):
                    result['reason'] = 'invalid_ready'
                    return result
            result.update(status='ok', reason=None)
    except RedirectRefused:
        result['reason'] = 'redirect_refused'
    except Exception:
        # Exceptions may contain URLs, response bodies or local TLS details. Store only a fixed reason.
        result['reason'] = 'transport_error'
    return result


def safe_path(value, home):
    path, home = Path(value), Path(home)
    if not path.is_absolute() or not home.is_absolute() or path == home or '..' in path.parts:
        raise ValueError('private home path required')
    try:
        path.relative_to(home)
    except ValueError:
        raise ValueError('private home path required') from None
    for parent in (path, *path.parents):
        if parent == home.parent:
            break
        if parent.is_symlink():
            raise ValueError('symlink path refused')
        if parent.exists():
            info = parent.stat()
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise ValueError('unsafe ownership or permissions')
    return path


def private_file(path):
    if path.is_symlink():
        raise ValueError('symlink file refused')
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('private regular file required')


def write_private(path, value):
    private_file(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def iso_date(value):
    if not isinstance(value, str):
        return False
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None
    except ValueError:
        return False


def read_finding(path, check_id):
    private_file(path)
    if not path.exists():
        return None
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > LIMIT:
            raise ValueError('invalid health finding')
        value = json.loads(stream.read(LIMIT))
    if (not isinstance(value, dict) or set(value) != FINDING_KEYS or type(value['version']) is not int or value['version'] != 1 or value['checkId'] != check_id
            or type(value['occurrences']) is not int or value['occurrences'] < 1
            or not iso_date(value['firstSeen']) or not iso_date(value['lastSeen'])
            or (value['resolvedAt'] is not None and not iso_date(value['resolvedAt']))
            or value['reason'] not in REASONS
            or (value['httpStatus'] is not None and (type(value['httpStatus']) is not int or not 100 <= value['httpStatus'] <= 599))):
        raise ValueError('invalid health finding')
    return value


def update_finding(directory, result):
    if result['checkId'] not in CHECK_IDS:
        raise ValueError('unknown health check')
    path = directory / (result['checkId'] + '.json')
    previous = read_finding(path, result['checkId'])
    if result['status'] == 'failed':
        finding = {'version': 1, 'checkId': result['checkId'],
                   'firstSeen': previous['firstSeen'] if previous else result['checkedAt'],
                   'lastSeen': result['checkedAt'], 'occurrences': previous['occurrences'] + 1 if previous else 1,
                   'resolvedAt': None, 'reason': result['reason'], 'httpStatus': result['httpStatus']}
        write_private(path, finding)
    elif previous and previous['resolvedAt'] is None:
        write_private(path, {**previous, 'resolvedAt': result['checkedAt']})


def run_health(state, *, home=None, now=None, make_opener=None):
    state = safe_path(state, Path(home or Path.home()))
    if not state.is_dir() or state.stat().st_mode & 0o077:
        raise ValueError('state directory must be private')
    findings = safe_path(state / 'health-findings', Path(home or Path.home()))
    if not findings.exists():
        findings.mkdir(mode=0o700)
    if not findings.is_dir() or findings.stat().st_mode & 0o077:
        raise ValueError('findings directory must be private')
    lock = state / '.health.lock'
    private_file(lock)
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    with os.fdopen(fd, 'r+') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        checked_at = (now or datetime.now(timezone.utc)).isoformat()
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(CHECKS)) as pool:
            results = list(pool.map(lambda check: check_once(check, checked_at, make_opener), CHECKS))
        for result in results:
            update_finding(findings, result)
        report = {'version': 1, 'environment': 'staging',
                  'status': 'healthy' if all(result['status'] == 'ok' for result in results) else 'degraded',
                  'checkedAt': checked_at, 'checks': results}
        write_private(state / 'health.json', report)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    args = parser.parse_args(argv)
    report = run_health(args.state)
    print(json.dumps(report, sort_keys=True))
    return 0 if report['status'] == 'healthy' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Incident health verification failed; diagnostic content withheld.', file=sys.stderr)
        sys.exit(1)
