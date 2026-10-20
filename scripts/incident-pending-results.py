#!/usr/bin/env python3
"""Durable, idempotent delivery of already-created incident PRs. No model or Git operations."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone

REPO = 'Gaes-Solutions/verticals'
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
MAX_BYTES = 131072
CLIENT = Path(__file__).resolve().with_name('incident-worker-client.py')


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def _decode(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out: raise ValueError('duplicate field')
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))


def _safe(path):
    p = Path(path)
    if not p.is_absolute() or p.resolve() != p or any(x.is_symlink() for x in (p, *p.parents)):
        raise ValueError('unsafe private path')
    return p


def _directory(path):
    p = _safe(path)
    p.mkdir(mode=0o700, exist_ok=True)
    mode = p.stat()
    if not stat.S_ISDIR(mode.st_mode) or mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) & 0o077:
        raise ValueError('private directory required')
    return p


def _read(path, private=False):
    p = _safe(path)
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        mode = os.fstat(source.fileno())
        if not stat.S_ISREG(mode.st_mode) or not 0 < mode.st_size <= MAX_BYTES:
            raise ValueError('invalid private file')
        if private and (mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) & 0o077):
            raise ValueError('private file required')
        return source.read(MAX_BYTES+1)


def _write(path, value):
    path = _safe(path)
    raw = _canonical(value)
    if len(raw) > MAX_BYTES: raise ValueError('oversized pending result')
    fd, name = tempfile.mkstemp(prefix='.pending-', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(raw); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
        _sync(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)


def _client(path=CLIENT):
    path = _safe(path)
    spec = importlib.util.spec_from_file_location('gaes_pending_transport', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def _identity(run_id):
    if not isinstance(run_id, str) or not UUID.fullmatch(run_id): raise ValueError('invalid local run identity')
    return 'urn:gaes:incident-worker:'+run_id


def _validate_result(client, worker, result, run_id, allow_expired=False):
    expected_url = _identity(run_id)
    check = worker
    if allow_expired:
        # Validate every field and digest through the same client, without discarding expired evidence.
        check = dict(worker)
        check['leaseExpiresAt'] = '9999-01-01T00:00:00+00:00'
    client.validate_worker(check)
    client.run_url = lambda: expected_url
    return client.report_body(worker, result)


def _layout(state):
    state = _directory(state)
    return state, _directory(state/'pending-results'), _directory(state/'delivered-results')


@contextmanager
def _lock(state):
    state, pending, delivered = _layout(state)
    path = _safe(state/'pending-results.lock')
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a+b') as file:
        mode = os.fstat(file.fileno())
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid() or stat.S_IMODE(mode.st_mode) & 0o077:
            raise ValueError('private lock required')
        fcntl.flock(file, fcntl.LOCK_EX)
        yield state, pending, delivered


def _markers(pending):
    markers = sorted(pending.glob('*.json'))
    for path in markers:
        if not UUID.fullmatch(path.stem): raise ValueError('invalid pending identity')
        _read(path, private=True)
    return markers


def pending_run_ids(state):
    with _lock(state) as (_, pending, _):
        return {p.stem for p in _markers(pending)}


def save_pending(state, workerPath, resultPath, runId):
    """Persist complete validated copies BEFORE the first delivery attempt; never sends anything."""
    client = _client()
    worker, result = _decode(_read(workerPath)), _decode(_read(resultPath))
    _validate_result(client, worker, result, runId)
    body = {'version': 1, 'runId': runId, 'worker': worker, 'result': result}
    with _lock(state) as (_, pending, delivered):
        name = runId+'.json'
        for path in (pending/name, delivered/name):
            if path.exists() or path.is_symlink():
                existing = _decode(_read(path, private=True))
                if any(existing.get(k) != value for k, value in body.items()): raise ValueError('conflicting saved result')
                return
        _write(pending/name, body)


# Only this fixed child operation can access the purpose-bound transport token.
# It always posts the original pr_created result. There is no failed-result fallback.
_DELIVER = r'''
import importlib.util,json,sys,urllib.error
from datetime import datetime,timezone
try:
    spec=importlib.util.spec_from_file_location('pending_transport',sys.argv[1]);client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
    worker=client.read_private(sys.argv[2]);result=client.read_private(sys.argv[3])
    if datetime.fromisoformat(worker['leaseExpiresAt'].replace('Z','+00:00'))<=datetime.now(timezone.utc):
        state='blocked'
    else:
        client.validate_worker(worker);body=client.report_body(worker,result)
        receipt=client.request('result',body)
        state='delivered' if isinstance(receipt,dict) and set(receipt)=={'accepted','idempotent'} and receipt['accepted'] is True and type(receipt['idempotent']) is bool else 'retry'
except urllib.error.HTTPError as error:
    state='blocked' if error.code==409 else 'retry'
except Exception:
    state='retry'
print(json.dumps({'state':state},separators=(',',':')))
'''


def _token(path):
    value = _read(path, private=True).decode().strip()
    if len(value) < 32 or '\n' in value or '\r' in value: raise ValueError('invalid purpose-bound credential')
    return value


def replay_pending(state, clientPath, credentialPath):
    """Replay exact successful results; any pending/blocked evidence must prevent new claims."""
    delivered_count = 0
    known_pending = 1
    blocked = False
    try:
        with _lock(state) as (state, pending, delivered):
            clientPath = _safe(clientPath)
            client = _client(clientPath)
            markers = _markers(pending)
            known_pending = len(markers)
            if not markers: return {'pending': 0, 'delivered': 0, 'blocked': False}
            token = _token(credentialPath)
            for marker in markers:
                entry = _decode(_read(marker, private=True))
                if not isinstance(entry, dict) or entry.get('version') != 1 or entry.get('runId') != marker.stem:
                    blocked = True; continue
                if entry.get('blocked') is True:
                    blocked = True; continue
                try:
                    try:
                        _validate_result(client, entry['worker'], entry['result'], entry['runId'], allow_expired=True)
                    except (ValueError, TypeError, KeyError):
                        entry['blocked'] = True; entry['reason'] = 'invalid_pending_evidence'; _write(marker, entry)
                        blocked = True; continue
                    expired = datetime.fromisoformat(entry['worker']['leaseExpiresAt'].replace('Z', '+00:00')) <= datetime.now(timezone.utc)
                    if expired:
                        entry['blocked'] = True; entry['reason'] = 'claim_expired'; _write(marker, entry)
                        blocked = True; continue
                    with tempfile.TemporaryDirectory(prefix='.pending-replay-', dir=state) as temp:
                        home = Path(temp); home.chmod(0o700)
                        worker, result = home/'worker.json', home/'result.json'
                        _write(worker, entry['worker']); _write(result, entry['result'])
                        env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(home), 'LANG': 'C.UTF-8', 'GITHUB_REPOSITORY': REPO, 'INCIDENT_LOCAL_RUN_ID': entry['runId'], 'INCIDENT_WORKER_TOKEN': token}
                        process = subprocess.run([sys.executable, '-I', '-c', _DELIVER, str(clientPath), str(worker), str(result)], cwd=home, env=env, capture_output=True, timeout=40)
                    response = _decode(process.stdout) if process.returncode == 0 and len(process.stdout) <= 1024 else {}
                    status = response.get('state') if isinstance(response, dict) else None
                    if status == 'delivered':
                        entry['deliveredAt'] = datetime.now(timezone.utc).isoformat()
                        _write(delivered/marker.name, entry)
                        marker.unlink(); _sync(pending)
                        delivered_count += 1
                    elif status == 'blocked':
                        entry['blocked'] = True; entry['reason'] = 'claim_conflict'; _write(marker, entry)
                        blocked = True
                except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
                    # Preserve complete evidence after network, filesystem or validation failures.
                    continue
            return {'pending': len(_markers(pending)), 'delivered': delivered_count, 'blocked': blocked}
    except (OSError, ValueError, TypeError, KeyError):
        return {'pending': known_pending, 'delivered': delivered_count, 'blocked': True}
