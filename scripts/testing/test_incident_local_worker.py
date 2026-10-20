#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
worker=load('localworker','incident-local-worker.py')
proxy=load('egress','incident-egress-proxy.py')

class LocalWorker(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.w=worker.Worker(self.root)
    def tearDown(self):self.temp.cleanup()
    def test_clean_env_has_no_provider_or_business_credentials(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'forbidden','DATABASE_URL_MASTER':'forbidden','GH_TOKEN':'forbidden'}):
            env=worker.clean_env(self.root)
        self.assertEqual(set(env),{'PATH','HOME','LANG','CI','GIT_TERMINAL_PROMPT'})
    def test_container_always_cleans_after_timeout(self):
        with patch.object(worker,'execute',side_effect=subprocess.TimeoutExpired('docker',1)) as run,patch.object(worker.subprocess,'run') as cleanup:
            with self.assertRaises(subprocess.TimeoutExpired):self.w.container([],{},['true'])
        args=run.call_args.args[0]
        for required in ('--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','--pids-limit=384'):
            self.assertIn(required,args)
        self.assertNotIn('--privileged',args);self.assertNotIn('seccomp=unconfined',args)
        self.assertEqual(cleanup.call_args.args[0][:3],['docker','rm','-f'])
    def test_quota_wait_does_not_claim(self):
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'quota',return_value={'status':'wait','reason':'included_quota_low','retryAt':None,'remainingPercent':5}),patch.object(self.w,'transport') as transport:
            self.w.once()
        transport.assert_not_called();self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'waiting')
    def test_no_work_does_not_start_models(self):
        with patch.object(worker,'execute',return_value=b''),patch.object(self.w,'quota',return_value={'status':'ready','remainingPercent':25}),patch.object(self.w,'clone',return_value=(self.root,'a'*40)),patch.object(self.w,'transport') as transport,patch.object(self.w,'phase') as phase:
            self.w.once()
        transport.assert_called_once_with('claim');phase.assert_not_called()
        self.assertEqual(json.loads((self.root/'status.json').read_text())['status'],'idle')
    def test_role_copies_auth_and_uses_internal_proxy(self):
        self.w.run=self.root/'run';self.w.run.mkdir();self.w.auth.mkdir();(self.w.auth/'auth.json').write_text('{"synthetic":"session"}');self.w.artifacts=self.root/'artifacts';self.w.artifacts.mkdir()
        with patch.object(self.w,'quota',return_value={'status':'ready'}),patch.object(worker,'execute',return_value=b''),patch.object(worker.subprocess,'run'),patch.object(self.w,'container') as run:
            self.w.phase('executor',self.root)
        mounts,env,command=run.call_args.args
        auth=next(source for source,target,ro in mounts if target=='/local-worker/auth')
        self.assertNotEqual(auth,self.w.auth);self.assertFalse(auth.exists());self.assertTrue((self.w.auth/'auth.json').is_file())
        self.assertTrue(run.call_args.kwargs['network'].startswith('gaes-incident-net-'))
        self.assertEqual(env['HTTPS_PROXY'],'http://openai-proxy:3128')
        self.assertFalse(any('/credentials' in str(source) or str(source)==str(Path.home()) for source,_,_ in mounts))
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

if __name__=='__main__':unittest.main()
