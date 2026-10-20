#!/usr/bin/env python3
"""Offline tests: fresh Git fixtures, fake Codex/GitHub/pnpm; no providers or databases."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

CONTROLLER = Path(__file__).resolve().parents[1] / 'autonomous-incident-cycle-phase.sh'
TARGET = 'apps/api/src/modules/tenant/categorias/routes.ts'
KEY = 'synthetic-isolated-auth-secret-never-upload'

class IncidentPhases(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gaes-incident-phase-')
        self.root = Path(self.temp.name)
        self.bin = self.root/'bin'; self.bin.mkdir()
        self.auth = self.root/'auth'; self.auth.mkdir(mode=0o700)
        (self.auth/'auth.json').write_text(json.dumps({'OPENAI_API_KEY':KEY})); (self.auth/'auth.json').chmod(0o600)
        self.art = self.root/'artifacts'; self.art.mkdir()
        self.base = self.root/'base'; self.base.mkdir()
        self.cmd(['git','init','-b','staging'],self.base)
        self.cmd(['git','config','user.name','Synthetic QA'],self.base)
        self.cmd(['git','config','user.email','synthetic@example.test'],self.base)
        for p,body in {
            TARGET:'export const existing = true;\n',
            'apps/api/src/modules/auth/routes.ts':'export const auth = true;\n',
            'apps/api/src/app.ts':'export const app = true;\n',
            'apps/api/test/setup.ts':'export const setup = true;\n',
            'scripts/testing/run-api-isolated.cjs':f"require('fs').appendFileSync({str(self.root/'checks.log')!r}, 'api\\n');\n",
        }.items():
            file=self.base/p; file.parent.mkdir(parents=True,exist_ok=True); file.write_text(body)
        self.cmd(['git','add','.'],self.base); self.cmd(['git','commit','-m','Synthetic baseline'],self.base)
        self.remote=self.root/'remote.git'; self.cmd(['git','clone','--bare',str(self.base),str(self.remote)],self.root)
        payload={'version':1,'incidentId':'c'+'1'*24,'handoffId':'c'+'2'*24,'claimId':'12345678-1234-4234-8234-123456789abc','leaseExpiresAt':(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat(),'payloadDigest':'a'*64,'provider':'codex','service':'api','message':'Synthetic category issue','stack':None,'route':'/categorias','proposal':{'summary':'Fix synthetic category'},'applied':False,'requiresReview':True,'execution':'external-isolated-worker-required'}
        (self.art/'worker.json').write_text(json.dumps(payload))
        self.env={'PATH':str(self.bin)+':'+os.environ['PATH'],'RUNNER_TEMP':str(self.root),'ARTIFACT_DIR':str(self.art),'INCIDENT_WORKER_FILE':str(self.art/'worker.json'),'CODEX_HOME':str(self.auth),'CODEX_AUTH_READY':'true','CODEX_BIN':str(self.bin/'codex'),'INCIDENT_TEST_MODE':'true','FRESH_RUNNER':'true','GITHUB_REPOSITORY':'Gaes-Solutions/verticals','GITHUB_RUN_ID':'12345'}
        self.pnpm('')
        self.gh('')
        self.codex()
        self.sequence=0

    def tearDown(self): self.temp.cleanup()
    def cmd(self,args,cwd=None,env=None):
        return subprocess.run(args,cwd=cwd or self.root,env=env,capture_output=True,text=True,check=True)
    def executable(self,name,body):
        p=self.bin/name; p.write_text('#!/usr/bin/env python3\n'+body); p.chmod(0o755)
    def codex(self,attack='',judge='APPROVED',chatgpt=False,version=None):
        expected_version=version or ('0.163.0' if chatgpt else '0.130.0')
        self.executable('codex',f'''import sys,os,json
from pathlib import Path
if '--version' in sys.argv: print('codex-cli {expected_version}'); sys.exit(0)
assert sys.argv[1:4]==['-a','never','exec']
assert '--ephemeral' in sys.argv and '--sandbox' in sys.argv
if {chatgpt!r}:
    assert '--ignore-user-config' in sys.argv and 'forced_login_method=\"chatgpt\"' in sys.argv and 'model_provider=\"openai\"' in sys.argv
    assert sys.argv[sys.argv.index('--model')+1]=='gpt-6.1-sol'
assert not any(k in os.environ for k in ['GH_TOKEN','OPENAI_API_KEY','BREVO_API_KEY','RESEND_API_KEY','DATABASE_URL_MASTER'])
if '--output-last-message' in sys.argv:
    assert sys.argv[sys.argv.index('--sandbox')+1]=='read-only'
    {attack if attack.startswith('JUDGE:') else 'pass'}
    Path(sys.argv[sys.argv.index('--output-last-message')+1]).write_text({judge!r}+'\\nSynthetic independent review.\\n')
else:
    assert sys.argv[sys.argv.index('--sandbox')+1]=='workspace-write'
    p=Path({TARGET!r}); p.write_text(p.read_text()+'export const fixed = true;\\n')
    {attack if not attack.startswith('JUDGE:') else 'pass'}
'''.replace('    JUDGE:','    '))
    def subscription_auth(self):
        self.env['CODEX_AUTH_MODE']='chatgpt'
        tokens={name:'synthetic-oauth-'+name+'-never-upload' for name in ('access_token','refresh_token','id_token')}
        (self.auth/'auth.json').write_text(json.dumps({'auth_mode':'chatgpt','OPENAI_API_KEY':None,'tokens':tokens}))
        (self.auth/'auth.json').chmod(0o600)
        self.codex(chatgpt=True)
        return tokens

    def pnpm(self,attack):
        self.executable('pnpm',f'''import sys,os
from pathlib import Path
assert not any(k in os.environ for k in ['GH_TOKEN','OPENAI_API_KEY','BREVO_API_KEY','RESEND_API_KEY','CODEX_HOME'])
Path({str(self.root/'checks.log')!r}).open('a').write('pnpm '+' '.join(sys.argv[1:])+'\\n')
{attack}
''')
    def gh(self,attack):
        self.executable('gh',f'''import sys,json
from pathlib import Path
with Path({str(self.root/'gh.log')!r}).open('a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')
assert sys.argv[1:3]!=['pr','merge']
if sys.argv[1:3]==['pr','create']:
    assert '--draft' in sys.argv and sys.argv[sys.argv.index('--base')+1]=='staging'
    {attack or "print('https://github.com/Gaes-Solutions/verticals/pull/123')"}
''')
    def phase(self,name,success=True,extra=None):
        self.sequence+=1; work=self.root/f'work-{self.sequence}'
        self.cmd(['git','clone','-b','staging',str(self.remote),str(work)])
        self.cmd(['git','checkout','--detach','HEAD'],work)
        env={**self.env,'AUTONOMY_PHASE':name}
        if name=='validate': env['DATABASE_URL_MASTER']='postgresql://postgres:synthetic@localhost:5432/postgres'
        if name=='publish': env.pop('CODEX_HOME'); env.pop('CODEX_AUTH_READY'); env['GH_TOKEN']='synthetic-publisher-only'
        env.update(extra or {})
        result=subprocess.run(['bash',str(CONTROLLER)],cwd=work,env=env,capture_output=True,text=True,timeout=45)
        if success: self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        else: self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertNotIn(KEY,result.stdout+result.stderr)
        return result,work
    def through(self,phase='judge'):
        for name in ['executor','validate','judge']:
            self.phase(name)
            if name==phase: return

    def test_full_pipeline_draft_staging_bound_result(self):
        self.through(); self.phase('publish')
        result=json.loads((self.art/'result.json').read_text())
        self.assertEqual(result['outcome'],'pr_created')
        self.assertEqual(result['payloadDigest'],'a'*64)
        self.assertEqual(result['claimId'],'12345678-1234-4234-8234-123456789abc')
        self.assertEqual(result['runUrl'],'https://github.com/Gaes-Solutions/verticals/actions/runs/12345')
        calls=(self.root/'checks.log').read_text(); self.assertIn('typecheck',calls); self.assertIn('build',calls); self.assertIn('vitest run',calls); self.assertIn('api\n',calls)
        requests=[json.loads(x) for x in (self.root/'gh.log').read_text().splitlines()]
        self.assertEqual(len(requests),2); self.assertIn('--draft',requests[1]); self.assertFalse(any(x[:2]==['pr','merge'] for x in requests))
    def test_forbidden_paths_fail_before_artifact(self):
        for path in ['apps/api/src/app.ts','apps/api/src/modules/auth/routes.ts','apps/api/test/setup.ts','apps/api/src/modules/tenant/cobros/routes.ts','package.json','.github/workflows/unsafe.yml']:
            with self.subTest(path=path):
                self.codex(f"p=Path({path!r}); p.parent.mkdir(parents=True,exist_ok=True); p.write_text('unsafe')")
                self.phase('executor',False)
                self.assertFalse((self.art/'metadata.json').exists())
    def test_captured_auth_cannot_be_removed_to_bypass_secret_scan(self):
        self.codex(f"auth=Path(os.environ['CODEX_HOME'])/'auth.json'; secret=json.loads(auth.read_text())['OPENAI_API_KEY']; auth.unlink(); p=Path({TARGET!r}); p.write_text(p.read_text()+secret)")
        self.phase('executor',False); self.assertFalse((self.art/'metadata.json').exists())
    def test_executor_cannot_change_git_config_or_index_flags(self):
        for attack in ["p=Path('.git/config'); p.write_text(p.read_text()+'\\n[unsafe]\\n enabled = true\\n')", f"__import__('subprocess').run(['git','update-index','--skip-worktree',{TARGET!r}],check=True)"]:
            with self.subTest(attack=attack):
                self.codex(attack); self.phase('executor',False)
                self.assertFalse((self.art/'metadata.json').exists())

    def test_symlink_change_rejected(self):
        self.codex(f"p=Path({TARGET!r}); p.unlink(); p.symlink_to('/etc/passwd')")
        self.phase('executor',False)
    def test_executor_artifact_tampering_rejected(self):
        self.codex(f"Path({str(self.art/'worker.json')!r}).write_text('{{}}')")
        self.phase('executor',False)
    def test_patch_tampering_and_payload_mismatch(self):
        self.phase('executor'); original=(self.art/'patch').read_bytes()
        (self.art/'patch').write_bytes(original+b'\nmalicious\n'); self.phase('validate',False)
        (self.art/'patch').write_bytes(original)
        worker=json.loads((self.art/'worker.json').read_text()); worker['payloadDigest']='b'*64; (self.art/'worker.json').write_text(json.dumps(worker))
        self.phase('validate',False)
    def test_missing_validation_blocks_judge_and_publisher(self):
        self.phase('executor'); self.phase('judge',False); self.phase('publish',False)
        self.assertFalse((self.art/'result.json').exists()); self.assertFalse((self.root/'gh.log').exists())
    def test_missing_judge_blocks_publisher(self):
        self.through('validate'); self.phase('publish',False); self.assertFalse((self.root/'gh.log').exists())
    def test_judge_editing_even_allowed_source_fails(self):
        self.through('validate'); self.codex(f"JUDGE:Path({TARGET!r}).write_text('changed by judge')")
        self.phase('judge',False); self.assertFalse((self.art/'judgment.json').exists())
    def test_rejected_judgment_cannot_publish(self):
        self.through('validate'); self.codex(judge='REJECTED'); self.phase('judge',False); self.phase('publish',False)
    def test_validation_mutation_blocks_evidence(self):
        self.phase('executor'); self.pnpm(f"Path({TARGET!r}).write_text('mutated by test')")
        self.phase('validate',False); self.assertFalse((self.art/'validation.json').exists())
    def test_validation_failure_blocks_evidence(self):
        self.phase('executor'); self.pnpm('sys.exit(1)'); self.phase('validate',False); self.assertFalse((self.art/'validation.json').exists())
    def test_private_check_home_exposes_browser_cache_only(self):
        personal=self.root/'personal-home'; (personal/'.cache/ms-playwright').mkdir(parents=True)
        (personal/'.cache/ms-playwright/browser.marker').write_text('synthetic-browser')
        (personal/'.npmrc').write_text('synthetic-personal-secret')
        self.env['HOME']=str(personal)
        self.phase('executor')
        self.pnpm("assert (Path(os.environ['HOME'])/'.cache/ms-playwright/browser.marker').read_text()=='synthetic-browser'; assert not (Path(os.environ['HOME'])/'.npmrc').exists()")
        self.phase('validate')

    def test_full_release_profile_never_falls_back_to_api_only(self):
        self.env['INCIDENT_FULL_RELEASE_AUDIT']='true'
        self.phase('executor')
        self.phase('validate',False)
        self.assertFalse((self.art/'validation.json').exists())
        metadata=json.loads((self.art/'metadata.json').read_text())
        self.assertEqual(metadata['validation_profile'],'release')
        audit=self.art/'patch-release-audit.json'
        if audit.exists():
            report=json.loads(audit.read_text())
            matrix=CONTROLLER.parent.parent/'automation/release-audit-matrix.json'
            self.assertEqual({row['checkId'] for row in report['results']},{row['id'] for row in json.loads(matrix.read_text())['checks']})
            self.assertEqual(report['controllerMatrixSha256'],hashlib.sha256(matrix.read_bytes()).hexdigest())
        else:
            log=self.root/'checks.log'
            self.assertFalse(log.exists() and 'api\n' in log.read_text())

    def test_full_release_profile_cannot_be_downgraded_between_roles(self):
        self.env['INCIDENT_FULL_RELEASE_AUDIT']='true'
        self.phase('executor')
        self.phase('validate',False,{'INCIDENT_FULL_RELEASE_AUDIT':'false'})
        self.assertFalse((self.art/'validation.json').exists())

    def test_no_business_keys_or_remote_database(self):
        self.phase('executor')
        self.phase('validate',False,{'BREVO_API_KEY':'synthetic-business'})
        self.phase('validate',False,{'DATABASE_URL_MASTER':'postgresql://user:secret@production.invalid/db'})
    def test_fresh_runner_guard_required(self):
        self.phase('executor'); self.phase('validate',False,{'FRESH_RUNNER':'false'})
    def test_main_target_and_auto_merge_are_blocked(self):
        self.phase('executor',False,{'BASE_BRANCH':'main'})
        self.phase('executor',False,{'AUTO_MERGE':'true'})
    def test_subscription_mode_pins_cli_model_auth_and_ignores_user_config(self):
        self.subscription_auth(); self.through()
        self.assertTrue((self.art/'judgment.json').exists())

    def test_subscription_mode_rejects_api_credentials_or_missing_oauth_fields(self):
        self.env['CODEX_AUTH_MODE']='chatgpt'; self.codex(chatgpt=True)
        for auth in [
            {'auth_mode':'apikey','OPENAI_API_KEY':'synthetic-api-forbidden'},
            {'auth_mode':'chatgpt','tokens':{'access_token':'synthetic-only-access'}},
            {'auth_mode':'chatgpt','OPENAI_API_KEY':'synthetic-api-forbidden','tokens':{x:'synthetic-token' for x in ('access_token','refresh_token','id_token')}},
        ]:
            with self.subTest(auth_mode=auth['auth_mode']):
                (self.auth/'auth.json').write_text(json.dumps(auth));self.phase('executor',False)
                self.assertFalse((self.art/'metadata.json').exists())

    def test_subscription_mode_requires_exact_0163_cli(self):
        self.subscription_auth(); self.codex(chatgpt=True,version='0.130.0'); self.phase('executor',False)
        self.codex(chatgpt=True,version='0.163.1'); self.phase('executor',False)

    def test_each_original_oauth_token_is_scanned_even_when_auth_rotates(self):
        for field in ('access_token','refresh_token','id_token'):
            with self.subTest(field=field):
                tokens=self.subscription_auth()
                attack=f"auth=Path(os.environ['CODEX_HOME'])/'auth.json'; secret=json.loads(auth.read_text())['tokens'][{field!r}]; auth.write_text(json.dumps({{'auth_mode':'chatgpt','tokens':{{'access_token':'new-access','refresh_token':'new-refresh','id_token':'new-id'}}}})); p=Path({TARGET!r}); p.write_text(p.read_text()+secret)"
                self.codex(attack,chatgpt=True); result,_=self.phase('executor',False)
                self.assertNotIn(tokens[field],result.stdout+result.stderr)
                self.assertFalse((self.art/'metadata.json').exists())

    def test_rotated_new_oauth_token_is_also_scanned(self):
        self.subscription_auth()
        attack=f"auth=Path(os.environ['CODEX_HOME'])/'auth.json'; data=json.loads(auth.read_text()); data['tokens']['access_token']='synthetic-brand-new-oauth-secret'; auth.write_text(json.dumps(data)); p=Path({TARGET!r}); p.write_text(p.read_text()+data['tokens']['access_token'])"
        self.codex(attack,chatgpt=True); self.phase('executor',False)
        self.assertFalse((self.art/'metadata.json').exists())

    def test_outer_docker_flag_cannot_disable_sandbox_without_kernel_attestation(self):
        result,work=self.phase('executor',False,{'INCIDENT_OUTER_SANDBOX':'docker'})
        self.assertNotIn('fixed = true',(work/TARGET).read_text())
        self.assertFalse((self.art/'metadata.json').exists())

    def test_local_publisher_records_urn_without_fabricating_a_github_actions_run(self):
        self.through(); self.phase('publish',True,{'INCIDENT_LOCAL_RUN_ID':'12345678-1234-4234-8234-123456789abc','GITHUB_RUN_ID':''})
        result=json.loads((self.art/'result.json').read_text())
        self.assertEqual(result['runUrl'],'urn:gaes:incident-worker:12345678-1234-4234-8234-123456789abc')
        self.assertNotIn('/actions/runs/',result['runUrl'])

    def test_invalid_local_uuid_blocks_publisher_before_any_external_side_effect(self):
        self.through(); self.phase('publish',False,{'INCIDENT_LOCAL_RUN_ID':'not-a-uuid'})
        self.assertFalse((self.art/'result.json').exists())
        self.assertFalse((self.root/'gh.log').exists())

    def test_wrong_codex_version_and_private_auth_permissions(self):
        self.executable('codex',"print('codex-cli 0.131.0')")
        self.phase('executor',False)
        self.codex(); (self.auth/'auth.json').chmod(0o644); self.phase('executor',False)
    def test_expired_claim_fails_before_model(self):
        worker=json.loads((self.art/'worker.json').read_text()); worker['leaseExpiresAt']='2000-01-01T00:00:00Z'; (self.art/'worker.json').write_text(json.dumps(worker))
        self.phase('executor',False)
    def test_publisher_invalid_pr_url_never_emits_success(self):
        self.through(); self.gh("print('https://attacker.invalid/pr/123')")
        self.phase('publish',False); self.assertFalse((self.art/'result.json').exists())

class WorkflowArchitecture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import re
        cls.source=(CONTROLLER.parents[0].parent/'.github/workflows/autonomous-incident-cycle.yml').read_text()
        cls.jobs={}
        matches=list(re.finditer(r'^  ([a-z]+):\n',cls.source,re.M))
        for index,match in enumerate(matches):
            cls.jobs[match.group(1)]=cls.source[match.start():matches[index+1].start() if index+1<len(matches) else len(cls.source)]
    def test_broker_disabled_by_default_main_guard_and_isolated_credential_roles(self):
        self.assertIn("vars.AUTONOMOUS_INCIDENT_ENABLED == 'true'",self.jobs['broker'])
        self.assertIn("github.ref == 'refs/heads/main'",self.jobs['broker'])
        for name,block in self.jobs.items():
            if 'OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}' in block: self.assertIn(name,['executor','judge'])
            if 'INCIDENT_WORKER_TOKEN: ${{ secrets.INCIDENT_WORKER_TOKEN }}' in block: self.assertIn(name,['broker','reporter'])
            if 'GH_TOKEN:' in block: self.assertEqual(name,'publish')
        for role in ['executor','judge']:
            self.assertIn('persist-credentials: false',self.jobs[role]); self.assertIn('CODEX_AUTH_READY:',self.jobs[role]); self.assertIn('0.130.0',self.jobs[role])
    def test_validation_is_fresh_qa_without_model_or_business_secrets(self):
        block=self.jobs['validate']; self.assertIn('runs-on: ubuntu-latest',block); self.assertIn('FRESH_RUNNER: "true"',block)
        self.assertIn('postgres:',block); self.assertIn('127.0.0.1:5432/postgres',block)
        self.assertIn('pnpm install --frozen-lockfile',block); self.assertIn('prisma:generate',block); self.assertIn('playwright install',block); self.assertIn('ffmpeg',block)
        self.assertNotIn('secrets.',block); self.assertNotIn('codex login',block)
        self.assertLess(block.index('pnpm install --frozen-lockfile'),block.index('AUTONOMY_PHASE: validate'))
    def test_publisher_and_reporter_execute_no_models_packages_or_merge(self):
        publish=self.jobs['publish']; reporter=self.jobs['reporter']
        self.assertIn('contents: write',publish); self.assertIn('pull-requests: write',publish)
        for block in (publish,reporter):
            self.assertNotIn('codex login',block); self.assertNotIn('npm install',block); self.assertNotIn('pnpm ',block); self.assertNotIn('pr merge',block)
        controller=CONTROLLER.read_text(); self.assertIn('gh pr create --repo Gaes-Solutions/verticals --draft --base staging',controller)
        self.assertNotIn('gh pr merge',controller); self.assertIn("needs.publish.result == 'success'",reporter)
    def test_artifacts_pinned_upstream_ids_and_no_raw_logs_uploaded(self):
        for role in ['executor','validate','judge','publish','reporter']:
            block=self.jobs[role]; self.assertIn('artifact-ids: ${{ needs.',block); self.assertIn('persist-credentials: false',block)
            self.assertNotIn('/judge.txt',block); self.assertNotIn('*.log',block); self.assertNotIn('/auth.json\n',block)
        self.assertIn('path: controller',self.jobs['executor']); self.assertIn('path: workspace',self.jobs['executor'])

if __name__=='__main__': unittest.main(verbosity=2)
