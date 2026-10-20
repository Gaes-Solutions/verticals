#!/usr/bin/env python3
"""Read-only ChatGPT authentication/quota gate. Never starts a thread or inference turn.

Protocol: Codex CLI 0.163.0 generated schemas and https://learn.chatgpt.com/docs/app-server.
No credit resets, purchases, nudges, API credentials or provider fallbacks are supported.
A ready result is a point-in-time check, not a reservation against concurrent clients.
"""
import argparse
import json
import math
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import time
from datetime import datetime, timezone

EXIT = {'ready': 0, 'wait': 75, 'auth_required': 77, 'unavailable': 69}
INCLUDED_PLANS = {'plus', 'pro', 'prolite', 'promax', 'team', 'business', 'edu', 'edu_plus', 'edu_pro', 'enterprise'}
MAX_BYTES = 1_048_576


class GateError(Exception):
    def __init__(self, status, reason):
        self.status, self.reason = status, reason


def outcome(status, reason, remaining=None, retry=None):
    return {'status': status, 'reason': reason, 'retryAt': retry, 'remainingPercent': remaining}


def strict_json(value):
    return json.loads(value, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


def private_home(value):
    home = Path(value)
    if not home.is_absolute() or home.resolve() != home or home == Path.home()/'.codex':
        raise GateError('auth_required', 'private_auth_required')
    if any(p.is_symlink() for p in (home, *home.parents)):
        raise GateError('auth_required', 'private_auth_required')
    mode = home.stat()
    if not stat.S_ISDIR(mode.st_mode) or mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) & 0o077:
        raise GateError('auth_required', 'private_auth_required')
    if any((home/name).exists() for name in ('config.toml', 'config.json', 'hooks.json')):
        raise GateError('unavailable', 'custom_config_forbidden')
    fd = os.open(home/'auth.json', os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as source:
        mode = os.fstat(source.fileno())
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) & 0o077 or not 0 < mode.st_size <= 65536:
            raise GateError('auth_required', 'private_auth_required')
        auth = strict_json(source.read())
    if not isinstance(auth, dict) or auth.get('auth_mode') != 'chatgpt' or auth.get('OPENAI_API_KEY'):
        raise GateError('auth_required', 'chatgpt_login_required')
    tokens = auth.get('tokens')
    if not isinstance(tokens, dict) or not isinstance(tokens.get('access_token'), str) or not tokens['access_token'].strip():
        raise GateError('auth_required', 'chatgpt_login_required')
    return home


def clean_environment(home):
    return {'PATH': os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin'), 'HOME': str(home), 'CODEX_HOME': str(home), 'LANG': 'C.UTF-8', 'NO_COLOR': '1'}


class ReadOnlyRpc:
    def __init__(self, binary, home, timeout):
        self.deadline = time.monotonic() + timeout
        self.buffer = b''
        self.total = 0
        self.notifications = 0
        self.proc = subprocess.Popen([binary, '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'cli_auth_credentials_store="file"', '-c', 'analytics.enabled=false', 'app-server', '--listen', 'stdio://'], cwd=home, env=clean_environment(home), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.proc.stdout, selectors.EVENT_READ)

    def close(self):
        self.selector.close()
        if self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try: self.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL); self.proc.wait(timeout=2)
        self.proc.stdin.close(); self.proc.stdout.close()

    def send(self, payload):
        self.proc.stdin.write((json.dumps(payload, separators=(',', ':'))+'\n').encode())
        self.proc.stdin.flush()

    def message(self):
        while b'\n' not in self.buffer:
            remaining = self.deadline-time.monotonic()
            if remaining <= 0 or not self.selector.select(remaining): raise GateError('unavailable', 'quota_query_timeout')
            chunk = os.read(self.proc.stdout.fileno(), 65536)
            if not chunk: raise GateError('unavailable', 'quota_protocol_unavailable')
            self.total += len(chunk)
            if self.total > MAX_BYTES: raise GateError('unavailable', 'quota_protocol_unavailable')
            self.buffer += chunk
        line, self.buffer = self.buffer.split(b'\n', 1)
        result = strict_json(line)
        if not isinstance(result, dict): raise GateError('unavailable', 'quota_protocol_unavailable')
        return result

    def request(self, ident, method, params=None):
        payload = {'id': ident, 'method': method}
        if params is not None: payload['params'] = params
        self.send(payload)
        while True:
            message = self.message()
            if 'method' in message:
                if 'id' in message: raise GateError('unavailable', 'unexpected_server_request')
                self.notifications += 1
                if self.notifications > 256: raise GateError('unavailable', 'quota_protocol_unavailable')
                if message['method'] == 'account/updated':
                    params = message.get('params', {})
                    if not isinstance(params, dict) or params.get('authMode') != 'chatgpt': raise GateError('auth_required', 'chatgpt_login_required')
                continue
            if type(message.get('id')) is not int or message['id'] != ident: raise GateError('unavailable', 'quota_protocol_unavailable')
            if 'error' in message: raise GateError('unavailable', 'quota_query_failed')
            if not isinstance(message.get('result'), dict): raise GateError('unavailable', 'quota_protocol_unavailable')
            return message['result']


def assess(account_response, response, minimum=10, now=None):
    now = time.time() if now is None else now
    account = account_response.get('account')
    if not isinstance(account, dict) or account.get('type') != 'chatgpt': return outcome('auth_required', 'chatgpt_login_required')
    if account.get('planType') not in INCLUDED_PLANS: return outcome('unavailable', 'included_plan_unknown')
    if response.get('ordinaryUsageAllowed') is not True:
        return outcome('wait' if response.get('ordinaryUsageAllowed') is False else 'unavailable', 'included_usage_unavailable')
    buckets = response.get('rateLimitsByLimitId')
    if buckets is not None:
        if not isinstance(buckets, dict) or not isinstance(buckets.get('codex'), dict): return outcome('unavailable', 'quota_bucket_unknown')
        bucket = buckets['codex']
    else:
        bucket = response.get('rateLimits')
    if not isinstance(bucket, dict) or bucket.get('limitId') not in (None, 'codex'): return outcome('unavailable', 'quota_bucket_unknown')
    if bucket.get('planType') is not None and bucket['planType'] != account['planType']: return outcome('unavailable', 'quota_plan_mismatch')
    credits = bucket.get('credits')
    if not isinstance(credits, dict) or credits.get('hasCredits') is not False or credits.get('unlimited') is not False:
        return outcome('unavailable', 'extra_credit_state_unsafe')
    if bucket.get('spendControlReached') is True: return outcome('wait', 'included_usage_unavailable')
    if bucket.get('rateLimitReachedType') is not None: return outcome('wait', 'included_usage_unavailable')
    windows = []
    for key in ('primary', 'secondary'):
        if key not in bucket: return outcome('unavailable', 'quota_window_unknown')
        window = bucket[key]
        # Explicit null is a documented non-applicable window, not missing telemetry.
        if window is None: continue
        if not isinstance(window, dict): return outcome('unavailable', 'quota_window_unknown')
        used, duration, reset = window.get('usedPercent'), window.get('windowDurationMins'), window.get('resetsAt')
        if type(used) not in (int, float) or not math.isfinite(used) or not 0 <= used <= 100 or type(duration) is not int or duration <= 0 or type(reset) is not int or not now < reset <= now+366*86400:
            return outcome('unavailable', 'quota_window_unknown')
        windows.append((100-used, reset))
    if not windows: return outcome('unavailable', 'quota_window_unknown')
    remaining = min(item[0] for item in windows)
    low = [item[1] for item in windows if item[0] < minimum]
    if low:
        retry = datetime.fromtimestamp(max(low), timezone.utc).isoformat().replace('+00:00', 'Z')
        return outcome('wait', 'quota_reserve_low', remaining, retry)
    return outcome('ready', 'included_quota_available', remaining)


def preflight(binary, home, minimum=10, timeout=20):
    rpc = None
    try:
        if type(minimum) not in (int, float) or not math.isfinite(minimum) or not 10 <= minimum <= 100 or not 0 < timeout <= 120:
            return outcome('unavailable', 'invalid_preflight_configuration')
        home = private_home(home)
        binary = str(Path(binary).resolve(strict=True))
        version = subprocess.run([binary, '--version'], cwd=home, env=clean_environment(home), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=min(timeout, 5), check=False)
        if version.returncode or version.stdout.strip() != b'codex-cli 0.163.0': return outcome('unavailable', 'unsupported_cli_version')
        rpc = ReadOnlyRpc(binary, home, timeout)
        rpc.request(1, 'initialize', {'clientInfo': {'name': 'gaes_subscription_quota', 'title': 'Gaes subscription quota preflight', 'version': '1.0.0'}, 'capabilities': {'experimentalApi': False}})
        rpc.send({'method': 'initialized'})
        account = rpc.request(2, 'account/read', {'refreshToken': False})
        if not isinstance(account.get('account'), dict) or account['account'].get('type') != 'chatgpt': return outcome('auth_required', 'chatgpt_login_required')
        limits = rpc.request(3, 'account/rateLimits/read')
        return assess(account, limits, minimum)
    except GateError as error: return outcome(error.status, error.reason)
    except subprocess.TimeoutExpired: return outcome('unavailable', 'quota_query_timeout')
    except (OSError, ValueError, TypeError, KeyError, OverflowError): return outcome('unavailable', 'quota_protocol_unavailable')
    finally:
        if rpc:
            try: rpc.close()
            except (OSError, subprocess.TimeoutExpired): pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--codex-bin', required=True)
    parser.add_argument('--codex-home', required=True)
    parser.add_argument('--min-remaining', type=float, default=10)
    parser.add_argument('--timeout', type=float, default=20)
    args = parser.parse_args()
    result = preflight(args.codex_bin, args.codex_home, args.min_remaining, args.timeout)
    print(json.dumps(result, allow_nan=False, separators=(',', ':')))
    return EXIT[result['status']]


if __name__ == '__main__': raise SystemExit(main())
