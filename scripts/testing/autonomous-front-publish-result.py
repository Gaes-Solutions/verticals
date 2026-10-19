"""Bounded safety-test evidence; capture is unprivileged, publish never executes artifacts."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

MAX_READ = 1_048_576
MAX_LOG = 131_072
GROUPS = ('syntax', 'legacy', 'phase', 'integration')
IMAGE = 'node:24-bookworm-slim@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7'


class EvidenceError(Exception):
    pass


def sanitize(text):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', text)
    text = re.sub(r'-----BEGIN [^-\n]*PRIVATE KEY-----.*?-----END [^-\n]*PRIVATE KEY-----', '[REDACTED]', text, flags=re.S)
    text = re.sub(r'(?im)^[A-Za-z0-9+/=]{48,}$', '[REDACTED]', text)
    text = re.sub(r'\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b', '[REDACTED]', text)
    text = re.sub(r'\b(?:gh[a-z]{1,4}_[A-Za-z0-9_]{6,}|github_pat_[A-Za-z0-9_]{6,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{8,}|xkeysib-[A-Za-z0-9_-]{8,}|re_[A-Za-z0-9_-]{12,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b', '[REDACTED]', text)
    text = re.sub(r'(?im)(authorization["\']?\s*[:=]\s*)[^\r\n]+', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)(\b[A-Z0-9_-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_-]*\b["\']?\s*[:=]\s*)(?:"[^"\r\n]*"|\'[^\'\r\n]*\'|[^\s,;}]+)', r'\1[REDACTED]', text)
    text = re.sub(r'(https?://)[^/\s:@]+:[^/\s@]+@', r'\1[REDACTED]@', text)
    token = os.environ.get('GH_TOKEN', '')
    if token:
        text = text.replace(token, '[REDACTED]')
    return text


def bounded_text(path, limit=MAX_LOG):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    except OSError:
        raise EvidenceError('Evidence file type is invalid') from None
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise EvidenceError('Evidence file type is invalid')
        offset = max(0, info.st_size - MAX_READ)
        stream.seek(offset)
        data = stream.read(MAX_READ)
        if offset:
            # Never expose a secret whose prefix was outside the retained tail.
            data = data.partition(b'\n')[2]
        clean = sanitize(data.decode('utf-8', errors='replace')).encode()
    return clean[-limit:].decode('utf-8', errors='replace')


def context():
    values = {key: os.environ.get(key, '') for key in ('GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')}
    values['GITHUB_RUN_ATTEMPT'] = values['GITHUB_RUN_ATTEMPT'] or '1'
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', values['GITHUB_REPOSITORY']):
        raise EvidenceError('Invalid workflow identity')
    if not re.fullmatch(r'[0-9a-f]{40}', values['GITHUB_SHA']):
        raise EvidenceError('Invalid workflow identity')
    if any(not re.fullmatch(r'[1-9][0-9]{0,19}', values[key]) for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')):
        raise EvidenceError('Invalid workflow identity')
    return values


def evidence_dir():
    directory = Path(os.environ['RUNNER_TEMP']) / 'autonomy-safety'
    if directory.is_symlink():
        raise EvidenceError('Evidence directory is invalid')
    return directory


def read_json(path):
    content = bounded_text(path, 16_384)
    if content is None:
        return None
    try:
        return json.loads(content)
    except (ValueError, TypeError):
        return None


def diagnostics():
    selected = os.environ.get('PNPM_BIN', '')
    action = os.environ.get('PNPM_ACTION_BIN', '')
    result = {'selectedPath': selected[:512], 'selectedRealpath': str(Path(selected).resolve())[:512] if selected else '',
              'actionPath': action[:512], 'actionRealpath': str(Path(action).resolve())[:512] if action else '',
              'corepackCache10332PresentBeforeChecks': (Path.home() / '.cache/node/corepack/v1/pnpm/10.33.2').is_dir(),
              'image': IMAGE}
    return result


def finish_diagnostics(result):
    result['corepackCache10332PresentAfterChecks'] = (Path.home() / '.cache/node/corepack/v1/pnpm/10.33.2').is_dir()
    for label, binary in (('selectedVersion', result['selectedPath']), ('actionVersion', result['actionPath'])):
        try:
            run = subprocess.run([binary, '--version'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20, text=True)
            version = run.stdout.strip()
            result[label] = version if run.returncode == 0 and re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', version) else 'unavailable'
        except (OSError, subprocess.TimeoutExpired):
            result[label] = 'unavailable'
    return result


def capture():
    identity = context()
    directory = evidence_dir()
    directory.mkdir(parents=True, exist_ok=True)
    diagnostic = diagnostics()
    (directory / 'diagnostics.json').write_text(json.dumps(diagnostic, indent=2))
    commands = {
        'syntax': [['bash', '-n', 'scripts/autonomous-front-cycle.sh'], ['bash', '-n', 'scripts/autonomous-front-cycle-phase.sh']],
        'legacy': [[sys.executable, 'scripts/testing/autonomous-front-cycle.test.py']],
        'phase': [[sys.executable, 'scripts/testing/autonomous-front-cycle-phase.test.py']],
        'integration': [[sys.executable, 'scripts/testing/autonomous-front-integration.test.py']],
    }
    codes = {}
    for group in GROUPS:
        code = 0
        with tempfile.TemporaryFile() as output:
            for command in commands[group]:
                try:
                    run = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, timeout=900 if group == 'integration' else 180)
                    code = run.returncode if run.returncode >= 0 else 128 - run.returncode
                except subprocess.TimeoutExpired:
                    code = 124
                    output.write(b'\nSafety command exceeded its time limit.\n')
                except OSError:
                    code = 127
                    output.write(b'\nSafety command could not start.\n')
                if code:
                    break
            size = output.tell()
            output.seek(max(0, size - MAX_READ))
            raw = output.read(MAX_READ)
            if size > MAX_READ:
                raw = raw.partition(b'\n')[2]
            clean = sanitize(raw.decode('utf-8', errors='replace')).encode()[-MAX_LOG:]
        (directory / f'{group}.log').write_bytes(clean)
        codes[group] = code
        print(f'Safety {group}: exit {code}', flush=True)
    exit_code = next((code for code in codes.values() if code), 0)
    (directory / 'result.json').write_text(json.dumps({'identity': identity, 'exitCode': exit_code, 'exitCodes': codes}, indent=2))
    # Version commands may initialize Corepack; never run them before the test.
    (directory / 'diagnostics.json').write_text(json.dumps(finish_diagnostics(diagnostic), indent=2))
    return exit_code


def publication_files(identity, directory):
    result = read_json(directory / 'result.json')
    valid = isinstance(result, dict) and result.get('identity') == identity
    codes = result.get('exitCodes') if valid else None
    valid = valid and isinstance(codes, dict) and set(codes) == set(GROUPS)
    valid = valid and all(type(code) is int and 0 <= code <= 255 for code in codes.values())
    if valid:
        expected = next((codes[group] for group in GROUPS if codes[group]), 0)
        valid = result.get('exitCode') == expected
    status = os.environ.get('SAFETY_JOB_RESULT', 'unknown')
    if status not in ('success', 'failure', 'cancelled', 'timed_out', 'skipped', 'unknown'):
        status = 'unknown'
    repo, sha = identity['GITHUB_REPOSITORY'], identity['GITHUB_SHA']
    summary = {'sourceCommit': sha, 'runId': identity['GITHUB_RUN_ID'], 'runAttempt': identity['GITHUB_RUN_ATTEMPT'],
               'runUrl': f'https://github.com/{repo}/actions/runs/{identity["GITHUB_RUN_ID"]}',
               'jobResult': status, 'evidenceComplete': bool(valid),
               'testExitCode': result['exitCode'] if valid else None, 'exitCodes': codes if valid else None,
               'scope': 'Synthetic agents, local bare Git and isolated Docker; no real models, mail or GitHub publication by tests.'}
    files = {}
    for group in GROUPS:
        content = bounded_text(directory / f'{group}.log')
        if content is not None:
            files[f'qa-autonomy-artifacts/{group}.log'] = content.encode()
    diagnostic = read_json(directory / 'diagnostics.json')
    if isinstance(diagnostic, dict):
        allowed = ('selectedPath', 'selectedRealpath', 'selectedVersion', 'actionPath', 'actionRealpath', 'actionVersion', 'corepackCache10332PresentBeforeChecks', 'corepackCache10332PresentAfterChecks', 'image')
        safe = {key: value for key, value in diagnostic.items() if key in allowed and (isinstance(value, bool) or isinstance(value, str) and len(value) <= 512)}
        files['qa-autonomy-artifacts/diagnostics.json'] = json.dumps(safe, indent=2).encode()
    summary['logSha256'] = {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}
    files['qa-autonomy-result.json'] = json.dumps(summary, indent=2).encode()
    return files


def api(repo, token, endpoint, payload=None):
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}/{endpoint}',
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json',
                 'Content-Type': 'application/json', 'User-Agent': 'GaesSoft-Safety-QA'},
        method='POST' if payload is not None else 'GET')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise EvidenceError(f'GitHub evidence API failed (HTTP {error.code})') from None
    except (OSError, ValueError):
        raise EvidenceError('GitHub evidence API request failed') from None


def object_sha(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{40}', value):
        raise EvidenceError('GitHub evidence API returned an invalid object')
    return value


def publish():
    identity = context()
    directory = evidence_dir()
    files = publication_files(identity, directory)
    repo, sha = identity['GITHUB_REPOSITORY'], identity['GITHUB_SHA']
    token = os.environ.get('GH_TOKEN', '')
    if not token:
        raise EvidenceError('Publisher token is unavailable')
    base = api(repo, token, f'git/commits/{sha}')
    tree_sha = object_sha(base.get('tree', {}).get('sha'))
    tree = []
    for name, content in files.items():
        blob = api(repo, token, 'git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
        tree.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': object_sha(blob.get('sha'))})
    tree = api(repo, token, 'git/trees', {'base_tree': tree_sha, 'tree': tree})
    commit = api(repo, token, 'git/commits', {'message': 'test: record sanitized autonomy safety evidence', 'tree': object_sha(tree.get('sha')), 'parents': [sha]})
    branch = f'qa-autonomy/{sha[:12]}-{identity["GITHUB_RUN_ID"]}-{identity["GITHUB_RUN_ATTEMPT"]}'
    api(repo, token, 'git/refs', {'ref': f'refs/heads/{branch}', 'sha': object_sha(commit.get('sha'))})
    print(f'Safety evidence saved on {branch}')
    return 0


def privacy_self_test():
    secrets = ['ghp_abcdefgh12345678', 'github_pat_abcdefgh12345678', 'sk-proj-abcdefgh12345678',
               'xkeysib-abcdefgh12345678', 're_abcdefgh123456789', 'eyJabcdefghi.abcdefghijk.abcdefghijk', 'unprefixed-sensitive-value']
    raw = '\n'.join(secrets[:-1]) + '\nAPI_KEY="' + secrets[-1] + '"\nAssertionError: expected 0, received 1\npnpm 10.33.2\n'
    clean = sanitize(raw)
    assert not any(secret in clean for secret in secrets), 'Secret redaction failed'
    assert 'AssertionError' in clean and '10.33.2' in clean, 'Useful diagnostics were removed'
    with tempfile.TemporaryDirectory(prefix='gaes-autonomy-evidence-privacy-') as temp:
        root = Path(temp)
        file = root / 'integration.log'
        file.write_text(('sk-proj-abcdefgh12345678' * 100_000) + '\nbenign final error\n')
        clean = bounded_text(file)
        assert len(clean.encode()) <= MAX_LOG and not any(secret in clean for secret in secrets)
        outside = root / 'private'; outside.write_text('never-read-this')
        file.unlink(); file.symlink_to(outside)
        try:
            bounded_text(file)
        except EvidenceError:
            pass
        else:
            raise AssertionError('Symlink was followed')
    from unittest.mock import patch
    error = urllib.error.HTTPError('https://example.invalid', 403, secrets[0], {'Authorization': secrets[1]}, None)
    with patch('urllib.request.urlopen', side_effect=error):
        try:
            api('qa/synthetic', 'synthetic', 'git/refs', {})
        except EvidenceError as failure:
            assert not any(secret in str(failure) for secret in secrets)
        else:
            raise AssertionError('API failure was ignored')
    print('PASS bounded logs, credential redaction, symlink rejection and static API errors (no network)')
    return 0


if __name__ == '__main__':
    try:
        mode = sys.argv[1:] or ['publish']
        if mode == ['capture']:
            code = capture()
        elif mode == ['publish']:
            code = publish()
        elif mode == ['privacy-self-test']:
            code = privacy_self_test()
        else:
            raise EvidenceError('Invalid evidence command')
        raise SystemExit(code)
    except EvidenceError as failure:
        print(str(failure), file=sys.stderr)
        raise SystemExit(1)
