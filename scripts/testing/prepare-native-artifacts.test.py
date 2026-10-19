"""Resolver subprocess tests with a fake gh executable; no network or real APKs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('prepare-native-artifacts.py')


class ArtifactResolverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gaes-artifact-resolver-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        testing = self.root / 'scripts/testing'
        testing.mkdir(parents=True)
        shutil.copyfile(SCRIPT, testing / SCRIPT.name)
        self.script = testing / SCRIPT.name
        self.manifest = {
            'release': {'tag': 'qa-android-test', 'title': 'Approved QA', 'sourceCommit': 'a' * 40},
            'payloadCommit': 'b' * 40,
            'client': {'version': 15, 'filename': 'client-v15.apk', 'sha256': hashlib.sha256(b'client').hexdigest()},
            'kiosk': {'filename': 'kiosk-v4.apk', 'sha256': hashlib.sha256(b'kiosk').hexdigest()},
        }
        (testing / 'android-staging-artifacts.json').write_text(json.dumps(self.manifest))
        self.state_path = self.root / 'state.json'
        self.set_state('absent')
        gh = self.root / 'gh'
        gh.write_text(f'#!{sys.executable}\n' + '''
import json,sys
from pathlib import Path
root=Path(__file__).parent
file=root/'state.json'
s=json.loads(file.read_text());args=sys.argv[1:];s['calls'].append(args);file.write_text(json.dumps(s))
if s['mode']=='unauthorized':
    sys.stderr.write('HTTP 401 private-token-must-not-appear')
    sys.exit(1)
if args[0]=='api' and '--paginate' in args:
    release={'tag_name':'qa-android-test','name':'Approved QA','prerelease':True,'draft':s['mode']=='draft'}
    if s['mode']=='identity':release['name']='Someone else'
    print(json.dumps([[] if s['mode']=='absent' else [release]]))
elif args[0]=='api':
    print(json.dumps({'object':{'type':'commit','sha':('b' if s['mode']=='target' else 'a')*40}}))
elif args[:2]==['release','download']:
    filename=args[args.index('--pattern')+1];directory=Path(args[args.index('--dir')+1])
    content=b'client' if filename.startswith('client') else b'kiosk'
    (directory/filename).write_bytes(b'tampered' if s['mode']=='tamper' else content)
else:raise RuntimeError('unexpected gh command')
''')
        gh.chmod(0o700)
        self.output = self.root / 'output'
        self.env = {**os.environ, 'PATH': str(self.root) + os.pathsep + os.environ['PATH'],
                    'RUNNER_TEMP': str(self.root / 'runner'), 'GITHUB_REPOSITORY': 'owner/repo',
                    'GITHUB_OUTPUT': str(self.output)}

    def set_state(self, mode):
        self.state_path.write_text(json.dumps({'mode': mode, 'calls': []}))

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(self.script), *args], env=self.env,
                              capture_output=True, text=True, timeout=10)

    def test_invalid_output_metadata_fails_before_network(self):
        target = self.root / 'scripts/testing/android-staging-artifacts.json'
        for field, value in [('payloadCommit', 'b' * 40 + '\nreusable=true'), ('version', True), ('version', 0)]:
            with self.subTest(field=field, value=value):
                changed = json.loads(json.dumps(self.manifest))
                if field == 'payloadCommit':
                    changed[field] = value
                else:
                    changed['client'][field] = value
                target.write_text(json.dumps(changed))
                result = self.run_script()
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.output.exists())
                self.assertEqual(json.loads(self.state_path.read_text())['calls'], [])

    def test_published_release_downloads_both_verified_apks(self):
        self.set_state('published')
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output.read_text(), 'payload=false\npayloadCommit=' + 'b' * 40 + '\nclientVersion=15\n')
        self.assertEqual((self.root / 'runner/native/client.apk').read_bytes(), b'client')
        self.assertEqual((self.root / 'runner/native/kiosk.apk').read_bytes(), b'kiosk')

    def test_draft_and_absent_release_select_bootstrap_without_download(self):
        for mode in ('draft', 'absent'):
            with self.subTest(mode=mode):
                self.set_state(mode)
                self.output.unlink(missing_ok=True)
                result = self.run_script()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.output.read_text(), 'payload=true\npayloadCommit=' + 'b' * 40 + '\nclientVersion=15\n')
                calls = json.loads(self.state_path.read_text())['calls']
                self.assertFalse(any(call[:2] == ['release', 'download'] for call in calls))

    def test_identity_target_and_remote_digest_mismatch_fail_closed(self):
        for mode in ('identity', 'target', 'tamper'):
            with self.subTest(mode=mode):
                self.set_state(mode)
                result = self.run_script()
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.output.exists())

    def test_auth_failure_does_not_fallback_or_print_cli_private_stderr(self):
        self.set_state('unauthorized')
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertNotIn('private-token', result.stdout + result.stderr)

    def test_bootstrap_hashes_are_checked_without_github_access(self):
        payload = self.root / '.native-apk-payload'
        payload.mkdir()
        for kind in ('client', 'kiosk'):
            (payload / self.manifest[kind]['filename']).write_bytes(kind.encode())
        result = self.run_script('payload')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.state_path.read_text())['calls'], [])
        (payload / self.manifest['client']['filename']).write_bytes(b'bad')
        self.assertNotEqual(self.run_script('payload').returncode, 0)


if __name__ == '__main__':
    unittest.main()
