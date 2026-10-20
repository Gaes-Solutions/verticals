#!/usr/bin/env python3
import importlib.util
from contextlib import nullcontext
import json
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
import uuid
from unittest.mock import Mock, patch

SCRIPTS=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
worker=load('localworker','incident-local-worker.py')
proxy=load('egress','incident-egress-proxy.py')
setup=load('setupworker','setup-incident-local.py')

class LocalWorker(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.w=worker.Worker(self.root)
        self.pending=types.SimpleNamespace(replay_pending=lambda *a:{'pending':0,'delivered':0,'blocked':False})
        self.audit=types.SimpleNamespace(run_audit=lambda *a:None)
        self.w.load_helper=lambda name: self.pending if name=='incident-pending-results' else types.SimpleNamespace(bridge=lambda *a:nullcontext([])) if name=='incident-media-sandbox' else self.audit
    def tearDown(self):self.temp.cleanup()
    def test_clean_env_has_no_provider_or_business_credentials(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'forbidden','DATABASE_URL_MASTER':'forbidden','GH_TOKEN':'forbidden'}):
            env=worker.clean_env(self.root)
        self.assertEqual(set(env),{'PATH','HOME','LANG','CI','GIT_TERMINAL_PROMPT'})
    def test_clone_recovers_over_ssh443_without_disabling_host_key_checks_or_forwarding_token(self):
        self.w.run=self.root/'run';self.w.run.mkdir();self.w.credentials.mkdir();token=self.w.credentials/'github-token';token.write_text('synthetic-token');token.chmod(0o600)
        def execute(args,**kwargs):
            if 'https://github.com/Gaes-Solutions/verticals.git' in args:
                partial=self.w.run/'executor';partial.mkdir();(partial/'partial').write_text('incomplete')
                raise subprocess.TimeoutExpired('synthetic network',90)
            if any(value.startswith('ssh://') for value in args):
                self.assertFalse((self.w.run/'executor').exists())
                env=kwargs['env'];self.assertNotIn('GIT_CONFIG_VALUE_0',env)
                self.assertIn('StrictHostKeyChecking=yes',env['GIT_SSH_COMMAND']);self.assertIn('HostKeyAlias=github.com',env['GIT_SSH_COMMAND'])
                self.assertIn('ssh://git@ssh.github.com:443/Gaes-Solutions/verticals.git',args)
            return b'a'*40 if 'rev-parse' in args else b''
        with patch.object(worker,'execute',side_effect=execute):directory,sha=self.w.clone('executor')
        self.assertEqual(sha,'a'*40);self.assertEqual(directory,self.w.run/'executor')

    def test_container_always_cleans_after_timeout(self):
        with patch.object(worker,'execute',side_effect=subprocess.TimeoutExpired('docker',1)) as run,patch.object(worker.subprocess,'run') as cleanup:
            with self.assertRaises(subprocess.TimeoutExpired):self.w.container([],{},['true'])
        args=run.call_args.args[0]
        for required in ('--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','--pids-limit=384'):
            self.assertIn(required,args)
        self.assertNotIn('--privileged',args);self.assertNotIn('seccomp=unconfined',args)
        self.assertEqual(cleanup.call_args.args[0][:3],['docker','rm','-f'])
    def test_quota_wait_does_not_claim(self):
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'quota',return_value={'status':'wait','reason':'included_quota_low','retryAt':None,'remainingPercent':5}),patch.object(self.w,'transport') as transport,patch.object(self.w,'clone',return_value=(self.root,'a'*40)):
            self.w.once()
        transport.assert_not_called();self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'waiting')
    def test_no_work_does_not_start_models(self):
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'quota',return_value={'status':'ready','remainingPercent':25}),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'transport') as transport,patch.object(self.w,'phase') as phase:
            self.w.once()
        transport.assert_called_once_with('claim');phase.assert_not_called()
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'idle')
    def test_proactive_audit_runs_even_when_subscription_unavailable(self):
        self.audit.run_audit=lambda *a:{'overall':'failed'}
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'quota') as quota,patch.object(self.w,'transport') as transport:
            self.w.once()
        quota.assert_not_called();transport.assert_not_called()
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'audit_attention_required')
    def test_pending_publication_prevents_new_claim_without_failed_callback(self):
        self.pending.replay_pending=lambda *a:{'pending':1,'delivered':0,'blocked':False}
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'quota') as quota,patch.object(self.w,'transport') as transport:
            self.w.once()
        quota.assert_not_called();transport.assert_not_called()
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'report_pending')

    def test_pending_publication_retry_never_starves_due_audit_or_starts_models(self):
        for blocked in (False, True):
            for outcome in ('passed', 'failed'):
                with self.subTest(blocked=blocked, outcome=outcome):
                    self.pending.replay_pending=lambda *a:{'pending':1,'delivered':0,'blocked':blocked}
                    audit=Mock(return_value={'overall':outcome})
                    self.audit.run_audit=audit
                    with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'quota') as quota,patch.object(self.w,'transport') as transport,patch.object(self.w,'phase') as phase:
                        self.w.once()
                    audit.assert_called_once_with(self.w,self.root,'a'*40)
                    quota.assert_not_called();transport.assert_not_called();phase.assert_not_called()
                    self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'audit_complete' if outcome=='passed' else 'audit_attention_required')
                    # A different cycle always owns its own artifact directory.
                    self.w.run_id=str(uuid.uuid4())

    def test_published_pr_is_saved_before_ack_and_ack_failure_never_reports_failed(self):
        events=[]
        self.pending.save_pending=lambda *args:events.append('saved')
        def transport(command,*args):
            events.append(command)
            (self.w.artifacts/'worker.json').write_text(json.dumps({'incidentId':'synthetic','claimId':'claim-one'}))
        # The initial replay precedes the claim. Subsequent replay follows durable save.
        first=[True]
        def ordered_replay(*args):
            if first[0]: first[0]=False;return {'pending':0,'delivered':0,'blocked':False}
            events.append('ack');raise RuntimeError('synthetic network failure')
        self.pending.replay_pending=ordered_replay
        with patch.object(worker,'execute',return_value=b''),patch.object(worker,'cleanup'),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'quota',return_value={'status':'ready'}),patch.object(self.w,'phase'),patch.object(self.w,'publish',side_effect=lambda *a:events.append('published')),patch.object(self.w,'transport',side_effect=transport):
            self.w.once()
        self.assertEqual(events,['claim','published','saved','ack'])
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'report_pending')

    def test_ambiguous_publication_blocks_without_reporting_failed(self):
        def transport(command,*args):
            self.assertEqual(command,'claim')
            (self.w.artifacts/'worker.json').write_text(json.dumps({'incidentId':'synthetic','claimId':'claim-one'}))
        with patch.object(worker,'execute',return_value=b''),patch.object(worker,'cleanup'),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'quota',return_value={'status':'ready'}),patch.object(self.w,'phase'),patch.object(self.w,'publish',side_effect=RuntimeError('synthetic ambiguous publication')),patch.object(self.w,'transport',side_effect=transport) as bridge:
            self.w.once()
        self.assertEqual(bridge.call_count,1)
        self.assertTrue((self.root/'publication-review.json').is_file())
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'publication_review_required')

    def test_running_audit_is_visible_without_reusing_old_pass_as_current_evidence(self):
        value={'status':'checking','runId':'a'*8+'-'+'b'*4+'-'+'c'*4+'-'+'d'*4+'-'+'e'*12}
        self.assertEqual(worker.audit_progress(self.root,value)['overall'],'preparing')
        path=self.root/'runs'/value['runId']/'artifacts/release-audit.json';path.parent.mkdir(parents=True)
        path.write_text(json.dumps({'overall':'running','baseSha':'f'*40,'results':[{'status':'passed'},{'status':'notrun'}]}))
        result=worker.audit_progress(self.root,value)
        self.assertEqual(result['counts']['passed'],1);self.assertEqual(result['counts']['notrun'],1)
        self.assertFalse(result['releaseReady'])
        self.assertIsNone(worker.audit_progress(self.root,{'status':'idle','runId':value['runId']}))
        self.assertIsNone(worker.audit_progress(self.root,{'status':'checking','runId':'../../forbidden'}))

    def test_role_copies_auth_and_uses_internal_proxy(self):
        self.w.run=self.root/'run';self.w.run.mkdir();self.w.auth.mkdir();(self.w.auth/'auth.json').write_text('{"synthetic":"session"}');self.w.artifacts=self.root/'artifacts';self.w.artifacts.mkdir()
        with patch.object(self.w,'quota',return_value={'status':'ready'}),patch.object(worker,'execute',return_value=b''),patch.object(worker.subprocess,'run'),patch.object(self.w,'container') as run:
            self.w.phase('executor',self.root)
        mounts,env,command=run.call_args.args
        auth=next(source for source,target,ro in mounts if target=='/local-worker/auth')
        self.assertNotEqual(auth,self.w.auth);self.assertFalse(auth.exists());self.assertTrue((self.w.auth/'auth.json').is_file())
        self.assertTrue(run.call_args.kwargs['network'].startswith('gaes-incident-net-'))
        self.assertEqual(env['HTTPS_PROXY'],'http://openai-proxy:3128')
        self.assertFalse(any(target in ('/qa-media','/qa-temp','/usr/bin/bwrap') for _,target,_ in mounts))
        self.assertFalse(any('/credentials' in str(source) or str(source)==str(Path.home()) for source,_,_ in mounts))
    def test_validation_browser_home_is_private_exec_capable_bind_without_auth(self):
        self.w.run=self.root/'run';self.w.run.mkdir();self.w.artifacts=self.root/'artifacts';self.w.artifacts.mkdir()
        with patch.object(self.w,'container') as run:
            self.w.phase('validate',self.root)
        mounts,env,_=run.call_args.args
        home=next(source for source,target,ro in mounts if target=='/tmp/worker-home')
        self.assertEqual(home.stat().st_mode&0o777,0o700)
        self.assertFalse(any(target=='/local-worker/auth' for _,target,_ in mounts))
        self.assertEqual(env['HOME'],'/tmp/worker-home')
        self.assertEqual(env['AUDIT_TMPDIR'],'/qa-temp')

    def test_private_credentials_reject_symlinks_and_public_permissions(self):
        target=self.root/'private';target.write_text('synthetic');target.chmod(0o600)
        link=self.root/'link';link.symlink_to(target)
        with self.assertRaises(RuntimeError):worker.private_file(link)
        target.chmod(0o644)
        with self.assertRaises(RuntimeError):worker.private_file(target)
    def test_status_is_bounded_to_typed_metadata(self):
        worker.checkpoint(self.root,'idle',reason='no_work',rawSecret='never-store')
        self.assertNotIn('never-store',(self.root/'status.json').read_text())

class Egress(unittest.TestCase):
    def test_arbitrary_hosts_ports_and_userinfo_rejected(self):
        for value in ('evil.invalid:443','chatgpt.com:80','chatgpt.com.evil.invalid:443','user@chatgpt.com:443','127.0.0.1:443'):
            with self.subTest(value=value),self.assertRaises(ValueError):proxy.target_address(value)
    def test_private_dns_answers_rejected(self):
        with patch.object(proxy.socket,'getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ValueError):proxy.target_address('chatgpt.com:443')
    def test_public_dns_answers_allowed_only_for_fixed_host(self):
        with patch.object(proxy.socket,'getaddrinfo',return_value=[(2,1,6,'',('1.1.1.1',443))]):
            self.assertEqual(proxy.target_address('chatgpt.com:443')[-1],('1.1.1.1',443))

class Preparation(unittest.TestCase):
    def test_intermediate_controller_is_private_and_existing_session_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);(home/'.codex').mkdir();auth=home/'.codex/auth.json'
            auth.write_text(json.dumps({'auth_mode':'chatgpt','OPENAI_API_KEY':None,'tokens':{'access_token':'synthetic-original'}}));auth.chmod(0o600)
            token=home/'.local/share/gaes-automation/incident-worker-token';token.parent.mkdir(parents=True);token.write_text('synthetic-bridge-credential-0123456789');token.chmod(0o600)
            with patch.object(setup.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'synthetic-github-token',b'')):
                state=setup.prepare(home,SCRIPTS.parent)
                self.assertEqual((state/'controller').stat().st_mode&0o777,0o700)
                self.assertEqual((state/'controller/scripts').stat().st_mode&0o777,0o700)
                saved=state/'chatgpt/auth.json';saved.write_text('dedicated-session-retained')
                setup.prepare(home,SCRIPTS.parent)
                self.assertEqual(saved.read_text(),'dedicated-session-retained')
                self.assertIn('synthetic-original',auth.read_text())
    def test_api_auth_rejected_before_github_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);(home/'.codex').mkdir();auth=home/'.codex/auth.json'
            auth.write_text(json.dumps({'auth_mode':'apikey','OPENAI_API_KEY':'synthetic-api'}));auth.chmod(0o600)
            with patch.object(setup.subprocess,'run') as gh:
                with self.assertRaises(ValueError):setup.prepare(home,SCRIPTS.parent)
                gh.assert_not_called()

if __name__=='__main__':unittest.main()
