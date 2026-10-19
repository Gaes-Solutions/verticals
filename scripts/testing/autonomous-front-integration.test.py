"""Autonomy integration: synthetic agents/mail, local bare Git, optional real Docker.

Default: python3 scripts/testing/autonomous-front-integration.test.py
Real container checks: AUTONOMY_DOCKER_INTEGRATION=true PNPM_BIN=/path/to/pnpm ...
Never loads real model credentials, sends email or publishes to GitHub.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CONTROLLER = ROOT / 'scripts/autonomous-front-cycle-phase.sh'
CONTROLLER_SOURCE = CONTROLLER.read_bytes()
DOCKER = os.environ.get('AUTONOMY_DOCKER_INTEGRATION') == 'true'
PNPM = os.environ.get('PNPM_BIN') or shutil.which('pnpm')


class PhaseFixture:
    def __init__(self, testcase, real_docker=False, docker_case='pass'):
        tmp = tempfile.TemporaryDirectory(prefix='gaes-autonomy-integration-')
        testcase.addCleanup(tmp.cleanup)
        self.temp = Path(tmp.name)
        self.root = self.temp / 'repo'
        self.root.mkdir()
        self.artifact = self.temp / 'artifact'
        self.bin = self.temp / 'bin'
        self.bin.mkdir()
        self.home = self.temp / 'home'
        self.home.mkdir()
        self.scenario = self.temp / 'scenario.json'
        self.scenario.write_text('{}')
        self.model_env = self.temp / 'model-env.json'
        self.mail = self.temp / 'mail.json'
        self.package_env = self.temp / 'package-env.jsonl'
        self.remote = self.temp / 'remote.git'
        self.real_docker = real_docker
        host_path = os.environ['PATH']
        if real_docker:
            if not PNPM:
                raise AssertionError('PNPM_BIN or a real pnpm on PATH is required')
            pnpm_path = Path(PNPM).expanduser().resolve()
            if not pnpm_path.is_file():
                raise AssertionError(f'PNPM_BIN is not a file: {PNPM}')
            (self.bin / 'pnpm').symlink_to(pnpm_path)
        self.env = {
            'PATH': f'{self.bin}:{host_path}', 'HOME': str(self.home), 'LANG': 'C.UTF-8',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
            'ARTIFACT_DIR': str(self.artifact), 'KIMI_BIN': str(self.bin / 'kimi'),
            'CODEX_BIN': str(self.bin / 'codex'),
            'KIMI_MODEL_NAME': 'synthetic-model', 'KIMI_MODEL_BASE_URL': 'https://example.invalid/v1',
            'KIMI_TIMEOUT': '3s', 'CODEX_TIMEOUT': '3s', 'CODEX_HOME': str(self.temp / 'codex'),
            'GITHUB_RUN_ID': 'integration-test', 'GITHUB_REPOSITORY': 'qa/synthetic',
            'AUTO_MERGE': 'false', 'AUTONOMY_VALIDATE_ISOLATED': 'true',
            'AUTONOMY_VALIDATE_TEST_MODE': 'false' if real_docker else 'true',
        }
        # Only the package-manager cache is exposed read-only by the controller;
        # HOME remains empty and no model/GitHub authentication is inherited.
        if real_docker:
            cache = os.environ.get('COREPACK_HOME')
            if not cache:
                candidate = Path.home() / '.cache/node/corepack'
                if candidate.is_dir():
                    cache = str(candidate)
            if cache:
                self.env['COREPACK_HOME'] = cache
        self.git('init', '-q', '-b', 'main')
        self.git('init', '--bare', '-q', str(self.remote))
        self.git('remote', 'add', 'origin', str(self.remote))
        (self.root / 'automation').mkdir()
        (self.root / 'automation/front-backlog.md').write_text('- [ ] ST-001 | Synthetic change\n')
        self.source = self.root / 'apps/web-tienda/src/base.ts'
        self.source.parent.mkdir(parents=True)
        self.source.write_text('export const price = 100;\n')
        (self.root / '.gitignore').write_text('node_modules/\n*.tsbuildinfo\n')
        scripts = self.root / 'scripts'
        scripts.mkdir()
        self.controller = scripts / 'autonomous-front-cycle-phase.sh'
        self.controller.write_bytes(CONTROLLER_SOURCE)
        self.controller.chmod(0o700)
        (scripts / 'send-system-email.py').write_text(
            f'import pathlib,sys\npathlib.Path({str(self.mail)!r}).write_text(sys.stdin.read())\n'
        )
        if real_docker:
            self.prepare_package_fixture(docker_case)
        self.git('add', '.')
        self.git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'base')
        self.base = self.git('rev-parse', 'HEAD').stdout.strip()
        self.git('push', '-q', 'origin', 'main')
        self.write_tools()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, env=self.env,
                              capture_output=True, text=True, check=True)

    def tool(self, name, body):
        file = self.bin / name
        file.write_text('#!/usr/bin/env python3\n' + body)
        file.chmod(0o700)

    def configure(self, **scenario):
        self.scenario.write_text(json.dumps(scenario))

    def write_tools(self):
        self.tool('kimi', f'''from pathlib import Path
import os,json
Path({str(self.model_env)!r}).write_text(json.dumps(dict(os.environ)))
Path('apps/web-tienda/src/base.ts').write_text('export const price = 101;\\n')
''')
        self.tool('codex', f'''from pathlib import Path
import json,sys,subprocess
scenario=json.loads(Path({str(self.scenario)!r}).read_text())
if scenario.get('judge_index_flag'):
    subprocess.run(['git','update-index',scenario['judge_index_flag'],'apps/web-tienda/src/base.ts'],check=True)
if scenario.get('judge_mutate_validation'):
    file=Path({str(self.artifact / 'validation.json')!r})
    data=json.loads(file.read_text()); data['state_fingerprint']='forged'; file.write_text(json.dumps(data))
out=Path(sys.argv[sys.argv.index('--output-last-message')+1])
out.write_text(('REJECTED' if scenario.get('reject') else 'APPROVED')+'\\nSynthetic review; no real model.\\n')
''')
        if not self.real_docker:
            self.tool('pnpm', f'''from pathlib import Path
import hashlib,json,os
with Path({str(self.package_env)!r}).open('a') as log:
    log.write(json.dumps([key for key in ('GH_TOKEN','KIMI_MODEL_API_KEY','OPENAI_API_KEY','RESEND_API_KEY','BREVO_API_KEY') if os.environ.get(key)])+'\\n')
scenario=json.loads(Path({str(self.scenario)!r}).read_text())
if scenario.get('replace_artifact'):
    artifact=Path({str(self.artifact)!r})
    replacement=(artifact/'patch').read_bytes().replace(b'+export const price = 101;',b'+export const price = 999;')
    digest=hashlib.sha256(replacement).hexdigest(); (artifact/'patch').write_bytes(replacement)
    (artifact/'patch.sha256').write_text(digest+'\\n')
    meta=json.loads((artifact/'metadata.json').read_text());meta['patch_sha256']=digest;(artifact/'metadata.json').write_text(json.dumps(meta))
''')
        self.tool('gh', "import sys\nif sys.argv[1:3]==['pr','create']: print('https://github.com/qa/synthetic/pull/1')\n")

    def prepare_package_fixture(self, case):
        (self.root / 'package.json').write_text(json.dumps({'private': True, 'packageManager': 'pnpm@10.33.2'}))
        (self.root / 'pnpm-workspace.yaml').write_text('packages:\n  - apps/*\n')
        app = self.root / 'apps/web-tienda'
        (app / 'package.json').write_text(json.dumps({
            'name': '@gaespos/web-tienda',
            'scripts': {'typecheck': 'node qa-typecheck.cjs', 'build': 'node qa-build.cjs'},
        }))
        (app / 'src/build').mkdir()
        (app / 'src/build/nested.ts').write_text('export const nested = 100;\n')
        driver = f'''const fs=require('node:fs');const scenario={json.dumps(case)};
module.exports=which=>{{
 console.log('QA_'+which);
 if(which==='typecheck'&&scenario==='typefail')process.exit(41);
 if(which==='typecheck'&&scenario==='cache')fs.writeFileSync('tsconfig.tsbuildinfo','synthetic incremental cache');
 if(which==='vitest'&&scenario==='mutate')fs.writeFileSync('src/base.ts','export const price = 999;\\n');
 if(which==='vitest'&&scenario==='mutate-build-path')fs.writeFileSync('src/build/nested.ts','export const nested = 999;\\n');
}};
'''
        (app / 'qa-driver.cjs').write_text(driver)
        (app / 'qa-typecheck.cjs').write_text("require('./qa-driver.cjs')('typecheck');\n")
        (app / 'qa-build.cjs').write_text("require('./qa-driver.cjs')('build');\n")
        executable = app / 'qa-vitest.cjs'
        executable.write_text("#!/usr/bin/env node\nrequire('./qa-driver.cjs')('vitest');\n")
        executable.chmod(0o755)
        (app / 'node_modules/.bin').mkdir(parents=True)
        (app / 'node_modules/.bin/vitest').symlink_to('../../qa-vitest.cjs')

    def use_regular_pnpm_shim(self, invalid=None):
        """Reproduce action-setup's non-symlink .bin entry; never execute it."""
        source = Path(PNPM).expanduser().resolve()
        package = source.parent.parent / 'pnpm' if source.parent.name == '.bin' else source.parent.parent
        metadata = json.loads((package / 'package.json').read_text())
        if metadata.get('name') == 'corepack':
            cache = Path(self.env.get('COREPACK_HOME', '')) / 'v1/pnpm/10.33.2'
            package = cache
        target = self.temp / 'setup-pnpm/node_modules/pnpm'
        target.parent.mkdir(parents=True)
        shutil.copytree(package, target)
        shim = target.parent / '.bin/pnpm'
        shim.parent.mkdir()
        shim.write_text('#!/bin/sh\necho SHIM_MUST_NOT_EXECUTE >&2\nexit 93\n')
        shim.chmod(0o755)
        if invalid:
            metadata = json.loads((target / 'package.json').read_text())
            if invalid == 'escape':
                outside = target.parent / 'pnpm.cjs'
                outside.write_text('throw Error("outside package");\n')
                metadata['bin']['pnpm'] = '../pnpm.cjs'
            elif invalid == 'name':
                metadata['name'] = 'not-pnpm'
            elif invalid == 'symlink':
                outside = target.parent / 'pnpm.cjs'
                outside.write_text('throw Error("outside package");\n')
                (target / 'bin/pnpm.cjs').unlink()
                (target / 'bin/pnpm.cjs').symlink_to(outside)
            (target / 'package.json').write_text(json.dumps(metadata))
        (self.bin / 'pnpm').unlink()
        (self.bin / 'pnpm').symlink_to(shim)
        return shim

    def phase(self, name):
        env = dict(self.env, AUTONOMY_PHASE=name)
        if name == 'executor':
            env['KIMI_MODEL_API_KEY'] = 'synthetic-kimi'
        if name == 'judge':
            env['OPENAI_API_KEY'] = 'synthetic-openai'
        if name == 'publish':
            env.update(GH_TOKEN='synthetic-github', BREVO_API_KEY='synthetic-mail',
                       EMAIL_REMITENTE='qa@example.invalid', INCIDENT_ALERT_EMAIL='qa@example.invalid')
        return subprocess.run(['bash', str(self.controller)], cwd=self.root, env=env,
                              capture_output=True, text=True, timeout=90)

    def export(self, testcase):
        result = self.phase('executor')
        testcase.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.git('reset', '--hard', '-q', self.base)

    def validate(self, testcase):
        result = self.phase('validate')
        testcase.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.git('reset', '--hard', '-q', self.base)

    def full_cycle(self, testcase):
        self.export(testcase)
        seen = json.loads(self.model_env.read_text())
        for key in ('GH_TOKEN', 'OPENAI_API_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY'):
            testcase.assertNotIn(key, seen)
        self.validate(testcase)
        result = self.phase('judge')
        testcase.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.git('reset', '--hard', '-q', self.base)
        result = self.phase('publish')
        testcase.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        changed = self.git('diff', '--name-only', self.base, 'HEAD').stdout.splitlines()
        testcase.assertEqual(set(changed), {'apps/web-tienda/src/base.ts', 'automation/front-backlog.md'})
        testcase.assertIn('- [x] ST-001', (self.root / 'automation/front-backlog.md').read_text())
        testcase.assertEqual(self.source.read_text(), 'export const price = 101;\n')
        if not self.real_docker:
            checks = [json.loads(line) for line in self.package_env.read_text().splitlines()]
            testcase.assertEqual(checks, [[], [], []], 'Package checks must not inherit provider/publication credentials')
        payload = json.loads(self.mail.read_text())
        testcase.assertIn('pendiente', payload['text'].lower())
        testcase.assertNotIn('integrado', payload['text'].lower())
        testcase.assertIn('https://github.com/qa/synthetic/pull/1', payload['text'])
        remote = self.git('ls-remote', '--heads', 'origin', 'automation/front-cycle-*').stdout
        testcase.assertTrue(remote, 'Expected only a local bare-Git branch publication')


class AutonomousIntegrationTests(unittest.TestCase):
    def test_four_phase_local_bare_git_and_pending_pr_email(self):
        PhaseFixture(self).full_cycle(self)

    def test_empty_backlog_never_invokes_models_or_publisher(self):
        fixture = PhaseFixture(self)
        (fixture.root / 'automation/front-backlog.md').write_text('- [x] ST-001 | Already completed\n')
        fixture.git('add', 'automation/front-backlog.md')
        fixture.git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', 'empty backlog')
        before = fixture.git('rev-parse', 'HEAD').stdout
        for phase in ('executor', 'validate', 'judge', 'publish'):
            result = fixture.phase(phase)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((fixture.artifact / 'no-work').read_text().strip(), 'no-work')
        self.assertFalse(fixture.model_env.exists())
        self.assertFalse(fixture.mail.exists())
        self.assertFalse((fixture.artifact / 'validation.json').exists())
        self.assertEqual(fixture.git('rev-parse', 'HEAD').stdout, before)

    def test_rejected_judge_cannot_publish(self):
        fixture = PhaseFixture(self)
        fixture.export(self)
        fixture.validate(self)
        fixture.configure(reject=True)
        decision = fixture.phase('judge')
        self.assertNotEqual(decision.returncode, 0)
        self.assertFalse((fixture.artifact / 'judgment.json').exists())
        fixture.git('reset', '--hard', '-q', fixture.base)
        publication = fixture.phase('publish')
        self.assertNotEqual(publication.returncode, 0)
        self.assertFalse(fixture.mail.exists())
        self.assertEqual(fixture.git('ls-remote', '--heads', 'origin', 'automation/front-cycle-*').stdout, '')

    def test_sensitive_path_is_rejected_before_it_is_written(self):
        fixture = PhaseFixture(self)
        fixture.export(self)
        target = 'apps/web-tienda/src/.env.qa'
        patch = (f'diff --git a/{target} b/{target}\n'
                 'new file mode 100644\n'
                 '--- /dev/null\n'
                 f'+++ b/{target}\n'
                 '@@ -0,0 +1 @@\n'
                 '+SYNTHETIC_ONLY=not-a-secret\n').encode()
        digest = hashlib.sha256(patch).hexdigest()
        (fixture.artifact / 'patch').write_bytes(patch)
        (fixture.artifact / 'patch.sha256').write_text(digest + '\n')
        metadata = json.loads((fixture.artifact / 'metadata.json').read_text())
        metadata.update(paths=[target], patch_sha256=digest)
        (fixture.artifact / 'metadata.json').write_text(json.dumps(metadata))
        result = fixture.phase('validate')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((fixture.root / target).exists(),
                         'Sensitive patch was applied before scope rejection')
        self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_pending_task_rejects_no_work_marker(self):
        fixture = PhaseFixture(self)
        fixture.export(self)
        (fixture.artifact / 'no-work').write_text('no-work\n')
        result = fixture.phase('validate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('marcador no-work', result.stderr)
        self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_validator_rejects_self_consistent_artifact_replacement(self):
        fixture = PhaseFixture(self)
        fixture.export(self)
        fixture.configure(replace_artifact=True)
        result = fixture.phase('validate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('artefacto aprobado', result.stderr)
        self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_judge_cannot_rewrite_validation_evidence(self):
        fixture = PhaseFixture(self)
        fixture.export(self)
        fixture.validate(self)
        fixture.configure(judge_mutate_validation=True)
        result = fixture.phase('judge')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('artefacto aprobado', result.stderr)
        self.assertFalse((fixture.artifact / 'judgment.json').exists())

    def test_judge_cannot_change_only_index_flags(self):
        for flag in ('--assume-unchanged', '--skip-worktree'):
            with self.subTest(flag=flag):
                fixture = PhaseFixture(self)
                fixture.export(self)
                fixture.validate(self)
                fixture.configure(judge_index_flag=flag)
                result = fixture.phase('judge')
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertFalse((fixture.artifact / 'judgment.json').exists())


@unittest.skipUnless(DOCKER, 'Set AUTONOMY_DOCKER_INTEGRATION=true for actual isolated Docker execution')
class AutonomousDockerIntegrationTests(unittest.TestCase):
    def test_real_docker_four_phases(self):
        PhaseFixture(self, real_docker=True).full_cycle(self)

    def test_real_docker_regular_action_setup_shim(self):
        fixture = PhaseFixture(self, real_docker=True)
        shim = fixture.use_regular_pnpm_shim()
        self.assertFalse(shim.is_symlink())
        fixture.full_cycle(self)

    def test_real_docker_regular_shim_rejects_invalid_package(self):
        for invalid in ('escape', 'name', 'symlink'):
            with self.subTest(invalid=invalid):
                fixture = PhaseFixture(self, real_docker=True)
                fixture.use_regular_pnpm_shim(invalid)
                fixture.export(self)
                result = fixture.phase('validate')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('paquete pnpm hermano inválido', result.stderr)
                self.assertNotIn('SHIM_MUST_NOT_EXECUTE', result.stderr)
                self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_real_docker_type_failure_cannot_be_masked_by_passing_build(self):
        fixture = PhaseFixture(self, real_docker=True, docker_case='typefail')
        fixture.export(self)
        result = fixture.phase('validate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('QA_typecheck', result.stdout)
        self.assertNotIn('QA_build', result.stdout)
        self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_real_docker_rejects_source_copy_mutation(self):
        self.assert_copy_mutation_rejected('mutate')

    def test_real_docker_rejects_source_directory_named_build(self):
        self.assert_copy_mutation_rejected('mutate-build-path')

    def assert_copy_mutation_rejected(self, case):
        fixture = PhaseFixture(self, real_docker=True, docker_case=case)
        fixture.export(self)
        result = fixture.phase('validate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('copia fuente aislada', result.stderr)
        self.assertEqual(fixture.source.read_text(), 'export const price = 101;\n')
        self.assertFalse((fixture.artifact / 'validation.json').exists())

    def test_real_docker_allows_generated_incremental_cache(self):
        fixture = PhaseFixture(self, real_docker=True, docker_case='cache')
        fixture.export(self)
        fixture.validate(self)


if __name__ == '__main__':
    print('Controller snapshot SHA256: ' + hashlib.sha256(CONTROLLER_SOURCE).hexdigest(), flush=True)
    unittest.main(verbosity=2)
