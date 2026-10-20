#!/usr/bin/env python3
"""Trusted, credential-scoped transport for the isolated incident worker."""
import argparse
import hashlib
import json
import os
import re
import stat
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ORIGIN = 'https://verticals-staging.up.railway.app'
REPO = 'Gaes-Solutions/verticals'
BASE_KEYS = {'version', 'incidentId', 'provider', 'service', 'message', 'stack', 'route', 'proposal', 'applied', 'requiresReview', 'execution'}
CLAIM_KEYS = {'handoffId', 'claimId', 'leaseExpiresAt', 'payloadDigest'}


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def decode(data):
    if len(data) > 65536:
        raise ValueError('oversized document')
    return json.loads(data.decode('utf-8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('invalid number')))


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def validate_worker(v):
    if not isinstance(v, dict) or set(v) != BASE_KEYS | CLAIM_KEYS:
        raise ValueError('invalid handoff fields')
    if type(v['version']) is not int or v['version'] != 1 or v['provider'] != 'codex' or v['execution'] != 'external-isolated-worker-required' or v['applied'] is not False or v['requiresReview'] is not True:
        raise ValueError('unsafe handoff mode')
    for key in ('incidentId', 'handoffId'):
        if not matches(r'[A-Za-z0-9_-]{1,100}', v[key]):
            raise ValueError('invalid identifier')
    if not matches(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', v['claimId']):
        raise ValueError('invalid claim')
    if not matches('[0-9a-f]{64}', v['payloadDigest']):
        raise ValueError('invalid digest')
    if datetime.fromisoformat(v['leaseExpiresAt'].replace('Z', '+00:00')) <= datetime.now(timezone.utc):
        raise ValueError('expired claim')
    for key, limit in [('service', 200), ('message', 4000), ('stack', 16000), ('route', 1000)]:
        value = v[key]
        if value is None and key in ('stack', 'route'):
            continue
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('invalid diagnostic field')
    p = v['proposal']
    if not isinstance(p, dict) or set(p) != {'summary', 'requiresHumanApproval', 'autoFixAllowed', 'testPlan'} or not isinstance(p['summary'], str) or not p['summary'] or p['requiresHumanApproval'] is not True or p['autoFixAllowed'] is not False or not isinstance(p['testPlan'], list) or not p['testPlan'] or any(not isinstance(t, str) or not t for t in p['testPlan']):
        raise ValueError('invalid reviewed proposal')
    digest = hashlib.sha256(canonical({k: v[k] for k in BASE_KEYS})).hexdigest()
    if digest != v['payloadDigest']:
        raise ValueError('handoff digest mismatch')
    return v


def read_private(path):
    p = Path(path)
    if not p.is_absolute() or any(q.is_symlink() for q in (p, *p.parents)):
        raise ValueError('unsafe artifact path')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as f:
        mode = os.fstat(f.fileno())
        if not stat.S_ISREG(mode.st_mode) or mode.st_size > 65536:
            raise ValueError('invalid artifact')
        return decode(f.read(65537))


def write_private(path, value):
    p = Path(path)
    if not p.is_absolute() or any(q.is_symlink() for q in (p, *p.parents)):
        raise ValueError('unsafe artifact path')
    p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(canonical(value))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect refused')


def request(endpoint, body):
    token = os.environ.get('INCIDENT_WORKER_TOKEN', '')
    origin = os.environ.get('INCIDENT_WORKER_ORIGIN', ORIGIN)
    if len(token) < 32 or '\n' in token or '\r' in token:
        raise ValueError('worker credential unavailable')
    if origin != ORIGIN and not (os.environ.get('INCIDENT_WORKER_TEST_MODE') == 'true' and matches(r'http://127\.0\.0\.1:[0-9]{1,5}', origin)):
        raise ValueError('untrusted API origin')
    req = urllib.request.Request(origin + '/internal/incident-worker/' + endpoint, data=canonical(body), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
        return decode(response.read(65537))


def run_url():
    if os.environ.get('GITHUB_REPOSITORY') != REPO:
        raise ValueError('untrusted repository identity')
    if 'INCIDENT_LOCAL_RUN_ID' in os.environ:
        local_id = os.environ['INCIDENT_LOCAL_RUN_ID']
        if not matches(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', local_id):
            raise ValueError('untrusted local run identity')
        return f'urn:gaes:incident-worker:{local_id}'
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if not matches(r'[1-9][0-9]*', run_id):
        raise ValueError('untrusted run identity')
    return f'https://github.com/{REPO}/actions/runs/{run_id}'


def report_body(worker, result=None):
    identity_url = run_url()
    body = {k: worker[k] for k in ('incidentId', 'claimId', 'payloadDigest')}
    body.update(outcome='failed', runUrl=identity_url)
    if result is None:
        return body
    expected = {'incidentId', 'claimId', 'payloadDigest', 'outcome', 'runUrl', 'prUrl', 'baseSha', 'patchSha'}
    if not isinstance(result, dict) or set(result) != expected or any(result[k] != body[k] for k in ('incidentId', 'claimId', 'payloadDigest', 'runUrl')) or result['outcome'] != 'pr_created' or not matches(r'https://github\.com/Gaes-Solutions/verticals/pull/[1-9][0-9]*', result['prUrl']) or not matches('[a-f0-9]{40}', result['baseSha']) or not matches('[a-f0-9]{64}', result['patchSha']):
        raise ValueError('untrusted publisher result')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['claim', 'report'])
    parser.add_argument('--worker', required=True)
    parser.add_argument('--result')
    args = parser.parse_args()
    if args.command == 'claim':
        response = request('claim', {})
        if not isinstance(response, dict) or set(response) != {'handoff'}:
            raise ValueError('invalid claim envelope')
        pending = response['handoff'] is not None
        if pending:
            write_private(args.worker, validate_worker(response['handoff']))
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf-8') as f:
                f.write(f'has_work={str(pending).lower()}\n')
        print('Work claimed.' if pending else 'No approved work.')
    else:
        worker = validate_worker(read_private(args.worker))
        result = read_private(args.result) if args.result else None
        body = report_body(worker, result)
        response = request('result', body)
        if not isinstance(response, dict) or set(response) != {'accepted', 'idempotent'} or response['accepted'] is not True or type(response['idempotent']) is not bool:
            raise ValueError('invalid result acknowledgement')
        print('Worker result accepted.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Incident worker transport failed; credentials and payload withheld.', file=sys.stderr)
        sys.exit(1)
