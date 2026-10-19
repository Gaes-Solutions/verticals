"""Pinned smoke reuse tests; fake gh subprocesses only, no network."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('verify-native-smoke-proof.py')
spec = importlib.util.spec_from_file_location('proof', SCRIPT)
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class SmokeProofTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gaes-smoke-proof-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        scripts = self.root / 'scripts/testing'
        scripts.mkdir(parents=True)
        shutil.copyfile(SCRIPT, scripts / SCRIPT.name)
        self.script = scripts / SCRIPT.name
        self.manifest = {'source': {'commit': 'a' * 40}, 'payloadCommit': 'b' * 40,
                         'client': {'sha256': 'c' * 64}, 'kiosk': {'sha256': 'd' * 64}}
        (self.root / proof.MANIFEST).write_text(json.dumps(self.manifest))
        self.state = {
            'run': {'id': proof.RUN, 'status': 'completed', 'head_sha': proof.HEAD, 'event': 'push',
                    'head_branch': proof.BRANCH, 'path': proof.WORKFLOW, 'repository': {'full_name': proof.REPO}},
            'jobs': {'total_count': 1, 'jobs': [{'id': 17, 'name': 'native', 'run_id': proof.RUN, 'status': 'completed',
                'steps': [{'name': name, 'status': 'completed', 'conclusion': 'success'} for name in proof.REQUIRED] +
                         [{'name': proof.PUBLISH, 'status': 'completed', 'conclusion': 'failure'}]}]},
            'manifest': {'encoding': 'base64', 'content': base64.b64encode(json.dumps(self.manifest).encode()).decode()},
            'unauthorized': False,
        }
        gh = self.root / 'gh'
        gh.write_text(f'#!{sys.executable}\n' + '''
import json,sys
from pathlib import Path
state=json.loads((Path(__file__).parent/'state.json').read_text())
if state['unauthorized']:
    print('HTTP 401 token-must-not-appear',file=sys.stderr);sys.exit(1)
endpoint=sys.argv[-1]
key='manifest' if '/contents/' in endpoint else 'jobs' if '/jobs?' in endpoint else 'run'
print(json.dumps(state[key]))
''')
        gh.chmod(0o700)

    def invoke(self):
        (self.root / 'state.json').write_text(json.dumps(self.state))
        env = {**os.environ, 'PATH': str(self.root) + os.pathsep + os.environ['PATH'],
               'GITHUB_REPOSITORY': proof.REPO, 'RUNNER_TEMP': str(self.root / 'runner'),
               'GITHUB_OUTPUT': str(self.root / 'output')}
        result = subprocess.run([sys.executable, str(self.script)], env=env, capture_output=True, text=True, timeout=10)
        report = json.loads((self.root / 'runner/native/results/native-proof.json').read_text())
        return result, report

    def assert_not_reusable(self):
        result, report = self.invoke()
        self.assertFalse(report['reusable'])
        self.assertNotIn('reusable=true', (self.root / 'output').read_text())
        self.assertNotIn('token-must-not-appear', result.stderr + result.stdout)

    def test_verified_native_success_can_reuse_despite_publisher_failure(self):
        result, report = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(report['reusable'])
        self.assertEqual(report['runId'], proof.RUN)
        self.assertEqual(report['apkSha256']['client'], self.manifest['client']['sha256'])
        self.assertEqual((self.root / 'output').read_text(), 'reusable=true\n')

    def test_manifest_tamper_requires_full_native(self):
        self.manifest['client']['sha256'] = 'f' * 64
        (self.root / proof.MANIFEST).write_text(json.dumps(self.manifest))
        self.assert_not_reusable()

    def test_failed_emulator_blocks_reuse(self):
        for step in self.state['jobs']['jobs'][0]['steps']:
            if step['name'].startswith('Run reactivecircus/'):
                step['conclusion'] = 'failure'
        self.assert_not_reusable()

    def test_run_head_identity_mismatch_blocks_reuse(self):
        self.state['run']['head_sha'] = 'f' * 40
        self.assert_not_reusable()

    def test_auth_failure_cannot_emit_reuse_or_private_diagnostics(self):
        self.state['unauthorized'] = True
        result, report = self.invoke()
        self.assertEqual(result.returncode, 1)
        self.assertFalse(report['reusable'])
        self.assertEqual((self.root / 'output').read_text(), 'reusable=false\n')
        self.assertNotIn('token-must-not-appear', result.stdout + result.stderr)

    def test_unexpected_job_failure_blocks_reuse(self):
        self.state['jobs']['jobs'][0]['steps'].append({'name': 'Other test', 'status': 'completed', 'conclusion': 'failure'})
        self.assert_not_reusable()

    def test_repository_workflow_event_or_incomplete_run_blocks_reuse(self):
        for key, value in [('event', 'pull_request'), ('path', 'other.yml'), ('status', 'in_progress'), ('head_branch', 'main')]:
            with self.subTest(key=key):
                original = self.state['run'][key]
                self.state['run'][key] = value
                self.assert_not_reusable()
                self.state['run'][key] = original


if __name__ == '__main__':
    unittest.main()
