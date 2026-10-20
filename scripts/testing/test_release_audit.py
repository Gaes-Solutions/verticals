#!/usr/bin/env python3
"""Release audit safety tests: fixtures/mocks and one disposable local child only."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_audit', ROOT / 'scripts/release-audit.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
DB = 'postgresql://qa:synthetic-only@127.0.0.1:5432/postgres'


class ReleaseAudit(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='release-audit-test-')
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.env_patch = patch.dict(os.environ, {'DATABASE_URL_MASTER': DB, 'AUDIT_HOME': str(self.directory / 'home'), 'AUDIT_TMPDIR': str(self.directory)}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def matrix(self):
        return json.loads((ROOT / audit.MATRIX_REL).read_text())

    def fixture_repo(self):
        repo = self.directory / 'repo'
        repo.mkdir()
        env = {**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}
        for command in [['git', 'init', '-q'], ['git', 'config', 'user.email', 'qa@example.invalid'], ['git', 'config', 'user.name', 'QA']]:
            subprocess.run(command, cwd=repo, env=env, check=True, capture_output=True)
        (repo / 'automation').mkdir()
        (repo / audit.MATRIX_REL).write_text(json.dumps(self.matrix()))
        (repo / 'README').write_text('synthetic')
        subprocess.run(['git', 'add', '.'], cwd=repo, env=env, check=True, capture_output=True)
        subprocess.run(['git', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], cwd=repo, env=env, check=True, capture_output=True)
        return repo

    def check(self, name='monorepo-typecheck'):
        return {'id': name, 'command': audit.FIXED_COMMANDS[name], 'timeoutSeconds': 10}

    def test_matrix_contains_every_fixed_check_and_builds_first_serially(self):
        matrix, digest = audit.load_matrix(ROOT)
        self.assertEqual({row['id'] for row in matrix['checks']}, audit.ALLOWED_COMMANDS)
        self.assertEqual(len(matrix['checks']), 19)
        self.assertEqual(len(digest), 64)
        self.assertEqual(matrix['checks'][0]['id'], 'web-builds')
        self.assertIn('--workspace-concurrency=1', matrix['checks'][0]['command'])
        self.assertIn('test/run-approved-incident-unit.config.ts', audit.FIXED_COMMANDS['api-unit'])
        self.assertEqual(len(audit.PACKAGE_TESTS), 14)
        self.assertIn('@gaespos/pos-desktop', audit.FIXED_COMMANDS['other-surface-unit'])
        self.assertNotIn('web-superadmin-unit', audit.ALLOWED_COMMANDS)
        self.assertTrue(matrix['manualRequired'])

    def test_external_trusted_matrix_works_when_checkout_does_not_have_one(self):
        repo = self.directory / 'checkout'
        repo.mkdir()
        trusted = self.directory / 'trusted.json'
        trusted.write_text(json.dumps(self.matrix()))
        matrix, digest = audit.load_matrix(repo, trusted)
        self.assertEqual(digest, audit.sha256(trusted))
        self.assertEqual(len(matrix['checks']), 19)

    def test_incomplete_duplicate_wrong_commands_or_missing_manual_gates_are_refused_upfront(self):
        original = self.matrix()
        mutations = []
        value = copy.deepcopy(original); value['checks'].pop(); mutations.append(value)
        value = copy.deepcopy(original); value['checks'][1] = value['checks'][0]; mutations.append(value)
        value = copy.deepcopy(original); value['checks'][0]['command'] = ['node', '-e', 'arbitrary()']; mutations.append(value)
        value = copy.deepcopy(original); value['checks'].reverse(); mutations.append(value)
        value = copy.deepcopy(original); value['manualRequired'] = []; mutations.append(value)
        for value in mutations:
            with self.subTest(value=value['checks'][0]['id']), self.assertRaises(SystemExit):
                source = self.directory / 'matrix.json'
                source.write_text(json.dumps(value))
                audit.load_matrix(self.directory, source)

    def test_remote_query_hash_and_host_override_databases_are_rejected(self):
        for value in ['postgresql://qa:q@db.example/qa', DB + '?host=production.example', DB + '?schema=business', DB + '#fragment', 'file:///tmp/database']:
            with self.subTest(value=value), patch.dict(os.environ, {'DATABASE_URL_MASTER': value}), self.assertRaises(SystemExit):
                audit.synthetic_environment()

    def test_environment_is_allowlisted_and_auth_values_are_controlled_synthetic(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'private', 'JWT_SECRET': 'business', 'NODE_OPTIONS': '--require /private', 'HTTPS_PROXY': 'private', 'BREVO_API_KEY': 'private'}):
            env = audit.synthetic_environment()
        self.assertEqual(env['DATABASE_URL_MASTER'], env['DATABASE_URL_TENANT'])
        self.assertEqual(env['JWT_SECRET'], 'test-jwt-secret-must-be-at-least-32-chars-long')
        self.assertEqual(env['BILLING_SCHEDULER_ENABLED'], 'false')
        self.assertEqual(env['PAGOS_ALLOW_MOCK'], 'true')
        for name in ['OPENAI_API_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY', 'NODE_OPTIONS', 'HTTPS_PROXY']:
            self.assertNotIn(name, env)
        self.assertEqual(Path(env['HOME']).stat().st_mode & 0o777, 0o700)

    def test_nonzero_and_missing_tool_are_explicit_failures_without_fail_fast(self):
        log = self.directory / 'failed.log'
        for outcome, state, reason in [(3, 'failed', 'command_exit_nonzero'), (FileNotFoundError(), 'blocked', 'required_tool_missing')]:
            with self.subTest(state=state), patch.object(audit, 'run_process', side_effect=outcome if isinstance(outcome, Exception) else None, return_value=outcome):
                result = audit.run_check(self.directory, self.check(), {}, log)
            self.assertEqual(result['status'], state)
            self.assertEqual(result['reason'], reason)
            self.assertEqual(len(result['logSha256']), 64)

    def test_css_is_prepared_before_controlled_browser_suite_and_failure_blocks_harness(self):
        for codes, calls in [([0, 0], 2), ([7], 1)]:
            with self.subTest(codes=codes), patch.object(audit, 'run_process', side_effect=codes) as run:
                result = audit.run_check(self.directory, self.check('storefront-controlled'), {}, self.directory / 'css.log')
                self.assertEqual(run.call_count, calls)
                self.assertEqual(run.call_args_list[0].args[0][:3], ['pnpm', 'exec', 'tailwindcss'])
                self.assertEqual(run.call_args_list[0].args[1], self.directory / 'apps/web-tienda')
                self.assertEqual(result['status'], 'passed' if calls == 2 else 'failed')

    def test_build_gets_production_env_without_mutating_other_checks(self):
        env = {'NODE_ENV': 'test'}
        with patch.object(audit, 'run_process', return_value=0) as run:
            audit.run_check(self.directory, self.check('web-builds'), env, self.directory / 'build.log')
        self.assertEqual(run.call_args.args[2]['NODE_ENV'], 'production')
        self.assertEqual(env['NODE_ENV'], 'test')

    def test_timeout_kills_only_the_owned_process_group_and_records_blocked(self):
        command = ['python3', '-c', 'import time;time.sleep(30)']
        with (self.directory / 'timeout.log').open('wb') as output, self.assertRaises(subprocess.TimeoutExpired):
            audit.run_process(command, self.directory, {'PATH': os.environ['PATH']}, output, 0.1)
        with patch.object(audit, 'run_process', side_effect=subprocess.TimeoutExpired('synthetic', 1)):
            result = audit.run_check(self.directory, self.check(), {}, self.directory / 'blocked.log')
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['reason'], 'timeout')

    def test_detached_cleanup_requires_explicit_container_flag_and_uses_pid_start_times(self):
        with patch.object(audit, 'process_snapshot') as snapshot, patch.object(audit.os, 'kill') as kill:
            audit.cleanup_new_processes({}, False)
            snapshot.assert_not_called(); kill.assert_not_called()
        before = {1: 'initial', 99: 'self'}
        current = {**before, 501: 'new'}
        with patch.object(audit.Path, 'is_file', return_value=True), patch.object(audit.os, 'getpid', return_value=99), patch.object(audit, 'process_snapshot', side_effect=[current, current, {**before, 501: 'reused'}]), patch.object(audit.os, 'kill') as kill, patch.object(audit.time, 'sleep'):
            audit.cleanup_new_processes(before, True)
        kill.assert_called_once_with(501, signal.SIGTERM)

    def test_main_writes_all_notrun_entries_before_first_check_and_complete_report(self):
        repo = self.fixture_repo()
        output = self.directory / 'artifacts/report.json'
        observed = []
        def run_check(_repo, check, _env, _log):
            prior = json.loads(output.read_text())
            observed.append(prior)
            return {'checkId': check['id'], 'status': 'passed', 'durationMs': 1, 'exitCode': 0, 'logSha256': '0' * 64}
        with patch.object(audit, 'run_check', side_effect=run_check), patch('sys.argv', ['release-audit.py', '--repo', str(repo), '--output', str(output)]):
            self.assertEqual(audit.main(), 0)
        self.assertEqual(len(observed[0]['results']), 19)
        self.assertTrue(all(row['status'] == 'notrun' for row in observed[0]['results']))
        report = json.loads(output.read_text())
        self.assertEqual(report['overall'], 'passed')
        self.assertEqual(len(report['results']), 19)
        self.assertIn('manualRequired', report)

    def test_interruption_preserves_incomplete_report_and_unexecuted_scope(self):
        repo = self.fixture_repo()
        output = self.directory / 'interrupted/report.json'
        with patch.object(audit, 'run_check', side_effect=KeyboardInterrupt()), patch('sys.argv', ['release-audit.py', '--repo', str(repo), '--output', str(output)]):
            self.assertEqual(audit.main(), 130)
        report = json.loads(output.read_text())
        self.assertEqual(report['overall'], 'incomplete')
        self.assertEqual(report['results'][0]['status'], 'blocked')
        self.assertTrue(all(row['status'] == 'notrun' for row in report['results'][1:]))


if __name__ == '__main__':
    unittest.main()
