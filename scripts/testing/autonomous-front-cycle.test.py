"""Fail-closed cycle tests: fake agents/git/gh/pnpm, isolated cwd, no network."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'autonomous-front-cycle.sh'


class AutonomousCycleTests(unittest.TestCase):
    def run_cycle(self, failure='', judge_status=0, answer='APPROVED\nEvidence', task='ST-001', kimi_status=0, judge_edits=False, committing_agent=''):
        with tempfile.TemporaryDirectory(prefix='gaes-cycle-test-') as directory:
            root = Path(directory)
            (root / 'automation').mkdir()
            backlog = root / 'automation/front-backlog.md'
            backlog.write_text(f'- [ ] {task} | Synthetic task\n')
            script = root / 'cycle.sh'
            # Keep fixed legacy PR body output isolated too.
            script.write_text(SOURCE.read_text().replace('/tmp/codex-judge.txt', str(root / 'judge.txt')))
            tool = root / 'fake-tool'
            tool.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
name=Path(sys.argv[0]).name;args=sys.argv[1:]
with open('calls.jsonl','a') as log:log.write(json.dumps([name,*args])+'\\n')
if name=='git':
    if args==['rev-parse','HEAD']:
        print(Path('fake-head').read_text() if Path('fake-head').exists() else 'a'*40)
    if args[:2]==['diff','--check']:sys.exit(41 if os.environ['FAIL_CHECK']=='git' else 0)
    if '--quiet' in args:sys.exit(1)
    if args[:2]==['ls-files','--others'] and Path('apps/web-tienda/src/judge.ts').exists():
        sys.stdout.buffer.write(b'apps/web-tienda/src/judge.ts\\0')
elif name=='pnpm':
    if ' '.join(args)==os.environ['FAIL_CHECK']:sys.exit(42)
elif name=='kimi':
    if os.environ['COMMITTING_AGENT']=='kimi':Path('fake-head').write_text('b'*40)
    sys.exit(int(os.environ['KIMI_STATUS']))
elif name=='codex':
    if os.environ['COMMITTING_AGENT']=='codex':Path('fake-head').write_text('c'*40)
    if os.environ['JUDGE_EDITS']=='true':
        target=Path('apps/web-tienda/src/judge.ts');target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(target.read_text()+'edited' if target.exists() else 'edited')
    Path(args[args.index('--output-last-message')+1]).write_text(os.environ['JUDGE_ANSWER'])
    print('APPROVED') # CLI logs must never authorize a rejected final answer.
    sys.exit(int(os.environ['JUDGE_STATUS']))
elif name=='gh':print('https://github.com/example/repo/pull/1')
''')
            tool.chmod(0o700)
            for name in ('git', 'pnpm', 'kimi', 'codex', 'gh'):
                (root / name).symlink_to(tool)
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'],
                   'KIMI_BIN': str(root / 'kimi'), 'CODEX_BIN': str(root / 'codex'),
                   'KIMI_TIMEOUT': '1s', 'CODEX_TIMEOUT': '2s', 'AUTO_MERGE': 'true',
                   'COMMITTING_AGENT': committing_agent, 'JUDGE_EDITS': str(judge_edits).lower(), 'KIMI_STATUS': str(kimi_status), 'FAIL_CHECK': failure, 'JUDGE_STATUS': str(judge_status), 'JUDGE_ANSWER': answer,
                   'BREVO_API_KEY': '', 'RESEND_API_KEY': '', 'CODEX_HOME': '',
                   'BACKLOG_FILE': 'automation/front-backlog.md'}
            result = subprocess.run(['bash', str(script)], cwd=root, env=env,
                                    capture_output=True, text=True, timeout=15)
            calls = [json.loads(line) for line in (root / 'calls.jsonl').read_text().splitlines()]
            return result, calls, backlog.read_text()

    def assert_not_published(self, result, calls, backlog):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(backlog.startswith('- [ ]'))
        self.assertFalse(any(call[0] == 'gh' for call in calls))
        self.assertFalse(any(call[:2] in [['git', 'commit'], ['git', 'push'], ['git', 'add']] for call in calls))

    def test_each_mandatory_validation_failure_prevents_judge_and_publish(self):
        checks = ['git', '--filter @gaespos/web-tienda typecheck',
                  '--filter @gaespos/web-tienda exec vitest run',
                  '--filter @gaespos/web-tienda build',
                  '--filter @gaespos/mobile-cliente typecheck',
                  '--filter @gaespos/mobile-cliente test -- --run']
        for check in checks:
            with self.subTest(check=check):
                task = 'ST-006' if 'mobile-cliente' in check else 'ST-001'
                result, calls, backlog = self.run_cycle(failure=check, task=task)
                self.assert_not_published(result, calls, backlog)
                self.assertFalse(any(call[0] == 'codex' for call in calls))

    def test_nonzero_or_timeout_status_cannot_authorize_partial_approval(self):
        for status in (1, 124, 137, 143):
            with self.subTest(status=status):
                self.assert_not_published(*self.run_cycle(judge_status=status))

    def test_rejection_first_line_cannot_be_overridden_by_later_approved(self):
        self.assert_not_published(*self.run_cycle(answer='REJECTED\nAPPROVED\nQuoted evidence'))
        self.assert_not_published(*self.run_cycle(answer=''))

    def test_executor_failure_is_not_reclassified_as_timeout_or_accepted_diff(self):
        for status in (1, 124, 137, 143):
            with self.subTest(status=status):
                result, calls, backlog = self.run_cycle(kimi_status=status)
                self.assert_not_published(result, calls, backlog)
                self.assertFalse(any(call[0] == 'codex' for call in calls))

    def test_executor_or_judge_cannot_hide_changes_by_moving_head(self):
        for agent in ('kimi', 'codex'):
            with self.subTest(agent=agent):
                result, calls, backlog = self.run_cycle(committing_agent=agent)
                self.assert_not_published(result, calls, backlog)
                self.assertIn('HEAD cambió', result.stderr)

    def test_real_commit_with_clean_worktree_cannot_hide_out_of_scope_change(self):
        source = SOURCE.read_text()
        guard = source[source.index('assert_front_scope() {'):source.index('\nTASK_PROMPT=', source.index('assert_front_scope() {'))]
        with tempfile.TemporaryDirectory(prefix='gaes-head-test-') as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL)
            git('init', '-q')
            (root / 'outside.txt').write_text('base')
            git('add', '.')
            git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'base')
            base = git('rev-parse', 'HEAD').decode().strip()
            (root / 'outside.txt').write_text('hidden commit')
            git('add', '.')
            git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'agent commit')
            self.assertEqual(git('status', '--porcelain'), b'')
            result = subprocess.run(['bash', '-c', f'task_id=ST-001\ncycle_base_commit={base}\n{guard}\nassert_front_scope fingerprint'], cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('HEAD cambió', result.stderr)

    def test_judge_editing_allowed_file_after_checks_cannot_publish(self):
        self.assert_not_published(*self.run_cycle(judge_edits=True))

    def test_actual_executor_deadline_returns_timeout_status(self):
        source = SOURCE.read_text()
        function = source[source.index('run_agent_with_timeout() {'):source.index('\nsend_email()', source.index('run_agent_with_timeout() {'))]
        result = subprocess.run(['bash', '-c', function + '\nrun_agent_with_timeout 1s bash -c "sleep 30"; code=$?; test "$code" = 124'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        self.assertEqual(result.returncode, 0)

    def test_scope_guard_checks_real_git_staged_untracked_and_both_rename_paths(self):
        source = SOURCE.read_text()
        guard = source[source.index('assert_front_scope() {'):source.index('\nTASK_PROMPT=', source.index('assert_front_scope() {'))]
        cases = ('allowed', 'staged', 'untracked', 'rename', 'sensitive', 'mobile-denied', 'mobile-allowed', 'symlink')
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix='gaes-scope-test-') as directory:
                root = Path(directory)
                def git(*args):
                    subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
                git('init', '-q')
                (root / 'outside.txt').write_text('original')
                git('add', '.')
                git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'fixture')
                app = root / 'apps/web-tienda/src'
                app.mkdir(parents=True)
                (app / 'feature.ts').write_text('safe')
                if case == 'staged':
                    (root / 'outside.txt').write_text('bad'); git('add', 'outside.txt')
                elif case == 'untracked':
                    (root / 'unexpected.txt').write_text('bad')
                elif case == 'rename':
                    git('mv', 'outside.txt', 'apps/web-tienda/src/moved.ts')
                elif case == 'sensitive':
                    (app / '.env.local').write_text('synthetic')
                elif case.startswith('mobile-'):
                    mobile = root / 'apps/mobile-cliente/src'; mobile.mkdir(parents=True)
                    (mobile / 'feature.ts').write_text('safe')
                elif case == 'symlink':
                    (app / 'linked.ts').symlink_to(root / 'outside.txt')
                task = 'ST-006' if case == 'mobile-allowed' else 'ST-001'
                result = subprocess.run(['bash', '-c', f'task_id={task}\ncycle_base_commit=$(git rev-parse HEAD)\n{guard}\nassert_front_scope'], cwd=root, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, case in ('allowed', 'mobile-allowed'), result.stdout + result.stderr)

    def test_snapshot_detects_index_only_change_with_identical_worktree(self):
        source = SOURCE.read_text()
        guard = source[source.index('assert_front_scope() {'):source.index('\nTASK_PROMPT=', source.index('assert_front_scope() {'))]
        with tempfile.TemporaryDirectory(prefix='gaes-index-test-') as directory:
            root = Path(directory)
            def git(*args):
                subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            git('init', '-q')
            file = root / 'apps/web-tienda/src/feature.ts'
            file.parent.mkdir(parents=True)
            file.write_text('original')
            git('add', '.')
            git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'fixture')
            file.write_text('modified')
            def fingerprint():
                return subprocess.check_output(['bash', '-c', f'task_id=ST-001\ncycle_base_commit=$(git rev-parse HEAD)\n{guard}\nassert_front_scope fingerprint'], cwd=root)
            before = fingerprint()
            git('add', str(file.relative_to(root)))
            self.assertEqual(file.read_text(), 'modified')
            self.assertNotEqual(before, fingerprint())

    def test_successful_exact_final_approval_can_publish(self):
        result, calls, backlog = self.run_cycle()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(backlog.startswith('- [x]'))
        self.assertTrue(any(call[:2] == ['git', 'push'] for call in calls))
        self.assertTrue(any(call[:3] == ['gh', 'pr', 'merge'] for call in calls))


if __name__ == '__main__':
    unittest.main()
