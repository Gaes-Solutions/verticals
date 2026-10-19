"""Reuse only the pinned, completed native smoke of these exact signed APKs."""
import base64
import json
import os
from pathlib import Path
import subprocess

REPO = 'Gaes-Solutions/verticals'
RUN = 39204599746
HEAD = '3a0488053bd91034cfeae7df71ba429e96d725af'
BRANCH = 'trabajo/codex-tienda-08sep'
WORKFLOW = '.github/workflows/android-staging-smoke.yml'
MANIFEST = 'scripts/testing/android-staging-artifacts.json'
PUBLISH = 'Publish both APKs only after successful Android checks'
REQUIRED = {
    'Validate embedded Maestro expressions before starting an emulator',
    'Verify that both APKs match current runtime sources',
    'Resolve published APKs or the immutable bootstrap payload',
    'Inspect both signed APKs and download pinned Maestro',
    'Prepare isolated synthetic shopper credentials',
    'Enable KVM for the disposable runner',
    'Run reactivecircus/android-emulator-runner@4c44018e59b437e86cdfc41da381398f93ed8808',
    'Sanitize all publishable text evidence',
}


def api(endpoint):
    try:
        raw = subprocess.check_output(['gh', 'api', f'repos/{REPO}/{endpoint}'],
                                      stderr=subprocess.PIPE, timeout=60)
        return json.loads(raw)
    except (subprocess.SubprocessError, ValueError):
        raise RuntimeError('GitHub proof metadata unavailable') from None


def evaluate(root):
    if os.environ.get('GITHUB_REPOSITORY') != REPO:
        return {'reusable': False, 'reason': 'repository_mismatch'}
    run = api(f'actions/runs/{RUN}')
    expected = {'id': RUN, 'status': 'completed', 'head_sha': HEAD, 'event': 'push',
                'head_branch': BRANCH, 'path': WORKFLOW}
    if any(run.get(key) != value for key, value in expected.items()) or run.get('repository', {}).get('full_name') != REPO:
        return {'reusable': False, 'reason': 'run_identity_mismatch'}
    jobs = api(f'actions/runs/{RUN}/jobs?filter=latest&per_page=100')
    rows = jobs.get('jobs', [])
    if jobs.get('total_count') != len(rows) or len(rows) != 1:
        return {'reusable': False, 'reason': 'job_inventory_mismatch'}
    job = rows[0]
    if job.get('name') != 'native' or job.get('status') != 'completed' or job.get('run_id') != RUN:
        return {'reusable': False, 'reason': 'native_job_mismatch'}
    steps = job.get('steps', [])
    for name in REQUIRED:
        matching = [step for step in steps if step.get('name') == name]
        if len(matching) != 1 or matching[0].get('status') != 'completed' or matching[0].get('conclusion') != 'success':
            return {'reusable': False, 'reason': 'native_step_not_successful'}
    if any(step.get('conclusion') in {'failure', 'cancelled', 'timed_out', 'action_required'} and step.get('name') != PUBLISH for step in steps):
        return {'reusable': False, 'reason': 'unexpected_failed_step'}
    remote = api(f'contents/{MANIFEST}?ref={HEAD}')
    try:
        original = json.loads(base64.b64decode(remote['content'], validate=False))
        current = json.loads((root / MANIFEST).read_text())
    except (KeyError, ValueError, OSError):
        raise RuntimeError('Native manifest proof unavailable') from None
    if remote.get('encoding') != 'base64' or original != current:
        return {'reusable': False, 'reason': 'manifest_changed'}
    return {
        'reusable': True, 'repository': REPO, 'runId': RUN, 'workflowHead': HEAD,
        'workflowPath': WORKFLOW, 'branch': BRANCH, 'jobId': job['id'],
        'apkSourceCommit': current['source']['commit'], 'payloadCommit': current['payloadCommit'],
        'apkSha256': {kind: current[kind]['sha256'] for kind in ('client', 'kiosk')},
        'successfulSteps': sorted(REQUIRED),
        'scope': 'Pinned Android smoke only; publication failure is excluded from native proof',
    }


def main():
    exit_code = 0
    try:
        report = evaluate(Path(__file__).resolve().parents[2])
    except (RuntimeError, KeyError, TypeError):
        report = {'reusable': False, 'reason': 'proof_metadata_unavailable'}
        exit_code = 1
    directory = Path(os.environ['RUNNER_TEMP']) / 'native/results'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'native-proof.json').write_text(json.dumps(report, indent=2) + '\n')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f"reusable={str(report['reusable']).lower()}\n")
    print(f"Native smoke reusable: {str(report['reusable']).lower()}")
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
