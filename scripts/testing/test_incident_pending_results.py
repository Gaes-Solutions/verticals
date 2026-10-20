#!/usr/bin/env python3
"""Durable delivery fixtures; subprocesses are mocks, no real HTTP, models or database."""
import concurrent.futures
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import types
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parents[1]/'incident-pending-results.py'
spec=importlib.util.spec_from_file_location('pending_results',SOURCE);pending=importlib.util.module_from_spec(spec);spec.loader.exec_module(pending)
RUN='12345678-1234-4234-8234-123456789abc'
RUN2='22345678-1234-4234-8234-123456789abc'


class PendingResults(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='gaes-pending-test-');self.root=Path(self.temp.name)
        self.state=self.root/'state';self.state.mkdir(mode=0o700)
        self.worker=self.root/'worker.json';self.result=self.root/'result.json';self.credential=self.root/'worker-token'
        self.credential.write_text('synthetic-purpose-bound-token-'+'x'*32);self.credential.chmod(0o600)
        base={'version':1,'incidentId':'synthetic-incident','provider':'codex','service':'api','message':'Synthetic issue','stack':None,'route':'/catalogo','proposal':{'summary':'Synthetic approved proposal','requiresHumanApproval':True,'autoFixAllowed':False,'testPlan':['typecheck','unit tests']},'applied':False,'requiresReview':True,'execution':'external-isolated-worker-required'}
        self.payload={**base,'handoffId':'synthetic-handoff','claimId':RUN,'leaseExpiresAt':(datetime.now(timezone.utc)+timedelta(minutes=90)).isoformat(),'payloadDigest':hashlib.sha256(pending._canonical(base)).hexdigest()}
        self.receipt={'incidentId':'synthetic-incident','claimId':RUN,'payloadDigest':self.payload['payloadDigest'],'outcome':'pr_created','runUrl':'urn:gaes:incident-worker:'+RUN,'prUrl':'https://github.com/Gaes-Solutions/verticals/pull/123','baseSha':'a'*40,'patchSha':'b'*64}
        self.write(self.worker,self.payload);self.write(self.result,self.receipt)
    def tearDown(self):self.temp.cleanup()
    def write(self,path,value):path.write_text(json.dumps(value));path.chmod(0o600)
    def save(self,run=RUN):pending.save_pending(self.state,self.worker,self.result,run)
    def replay(self):return pending.replay_pending(self.state,pending.CLIENT,self.credential)
    def response(self,state='delivered'):return types.SimpleNamespace(returncode=0,stdout=json.dumps({'state':state}).encode(),stderr=b'')
    def marker(self,run=RUN):return self.state/'pending-results'/(run+'.json')

    def test_save_is_durable_private_and_precedes_any_transport(self):
        with patch.object(pending.subprocess,'run') as process:
            self.save();process.assert_not_called()
        marker=self.marker();self.assertTrue(marker.exists());self.assertEqual(stat.S_IMODE(marker.stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(marker.parent.stat().st_mode),0o700)
        self.assertEqual(pending.pending_run_ids(self.state),{RUN})
        self.assertEqual(json.loads(marker.read_text())['result'],self.receipt)

    def test_copies_survive_original_artifacts_deleted_and_replay_preserves_exact_identity(self):
        self.save();self.worker.unlink();self.result.unlink()
        def deliver(args,**kwargs):
            worker=json.loads(Path(args[-2]).read_text());result=json.loads(Path(args[-1]).read_text())
            self.assertEqual(worker,self.payload);self.assertEqual(result,self.receipt)
            self.assertEqual(kwargs['env']['INCIDENT_LOCAL_RUN_ID'],RUN)
            self.assertEqual(kwargs['env']['GITHUB_REPOSITORY'],'Gaes-Solutions/verticals')
            self.assertEqual(kwargs['env']['INCIDENT_WORKER_TOKEN'],self.credential.read_text())
            for field in ('OPENAI_API_KEY','CODEX_HOME','GH_TOKEN','BREVO_API_KEY','DATABASE_URL_MASTER','PYTHONPATH'):self.assertNotIn(field,kwargs['env'])
            self.assertIn('-I',args);self.assertNotIn('failed',result['outcome'])
            return self.response()
        with patch.object(pending.subprocess,'run',side_effect=deliver):result=self.replay()
        self.assertEqual(result,{'pending':0,'delivered':1,'blocked':False})
        self.assertFalse(self.marker().exists());self.assertTrue((self.state/'delivered-results'/(RUN+'.json')).exists())

    def test_transport_failure_preserves_marker_and_only_success_is_retried(self):
        self.save()
        with patch.object(pending.subprocess,'run',side_effect=[self.response('retry'),self.response()]) as process:
            self.assertEqual(self.replay(),{'pending':1,'delivered':0,'blocked':False})
            self.assertEqual(json.loads(self.marker().read_text())['result']['outcome'],'pr_created')
            self.assertEqual(self.replay()['delivered'],1)
            self.assertEqual(process.call_count,2)

    def test_timeout_or_malformed_child_output_never_loses_published_pr(self):
        self.save()
        cases=[pending.subprocess.TimeoutExpired('synthetic',1),types.SimpleNamespace(returncode=0,stdout=b'raw non JSON synthetic-private-error',stderr=b'secret')]
        for response in cases:
            with self.subTest(response=type(response).__name__),patch.object(pending.subprocess,'run',side_effect=response if isinstance(response,Exception) else None,return_value=response):
                self.assertEqual(self.replay()['pending'],1);self.assertTrue(self.marker().exists())

    def test_conflict_blocks_manual_reconciliation_without_deleting_evidence(self):
        self.save()
        with patch.object(pending.subprocess,'run',return_value=self.response('blocked')) as process:
            self.assertEqual(self.replay(),{'pending':1,'delivered':0,'blocked':True})
            self.assertEqual(self.replay(),{'pending':1,'delivered':0,'blocked':True})
            self.assertEqual(process.call_count,1)
        self.assertEqual(json.loads(self.marker().read_text())['reason'],'claim_conflict')
        self.assertEqual(pending.pending_run_ids(self.state),{RUN})

    def test_expired_claim_is_retained_as_manual_block_without_http_attempt(self):
        self.save();entry=json.loads(self.marker().read_text());entry['worker']['leaseExpiresAt']='2000-01-01T00:00:00Z';self.write(self.marker(),entry)
        with patch.object(pending.subprocess,'run') as process:
            result=self.replay();process.assert_not_called()
        self.assertEqual(result,{'pending':1,'delivered':0,'blocked':True})
        self.assertEqual(json.loads(self.marker().read_text())['result'],self.receipt)

    def test_save_rejects_missing_failed_or_mismatched_result_before_marker(self):
        for field,value in [('outcome','failed'),('claimId',RUN2),('runUrl','https://attacker.invalid'),('incidentId','other')]:
            with self.subTest(field=field):
                result=dict(self.receipt);result[field]=value;self.write(self.result,result)
                with self.assertRaises(ValueError):self.save()
                self.assertFalse(self.marker().exists())

    def test_tampered_pending_outcome_cannot_be_delivered_as_failed(self):
        self.save();entry=json.loads(self.marker().read_text());entry['result']['outcome']='failed';self.write(self.marker(),entry)
        with patch.object(pending.subprocess,'run') as process:
            self.assertEqual(self.replay(),{'pending':1,'delivered':0,'blocked':True});process.assert_not_called()
        self.assertEqual(json.loads(self.marker().read_text())['reason'],'invalid_pending_evidence')

    def test_initial_save_requires_live_approved_handoff_digest(self):
        for field,value in [('leaseExpiresAt','2000-01-01T00:00:00Z'),('payloadDigest','c'*64),('provider','other')]:
            with self.subTest(field=field):
                worker=dict(self.payload);worker[field]=value;self.write(self.worker,worker)
                with self.assertRaises(ValueError):self.save()
                self.assertFalse(self.marker().exists())

    def test_symlink_pending_artifact_source_and_credentials_fail_closed(self):
        outside=self.root/'outside';outside.write_text('unchanged')
        self.worker.unlink();self.worker.symlink_to(outside)
        with self.assertRaises(ValueError):self.save()
        self.worker.unlink();self.write(self.worker,self.payload);self.save()
        self.marker().unlink();self.marker().symlink_to(outside)
        self.assertTrue(self.replay()['blocked']);self.assertEqual(outside.read_text(),'unchanged')

    def test_invalid_credential_is_retained_without_child_process(self):
        self.save();self.credential.write_text('short')
        with patch.object(pending.subprocess,'run') as process:
            self.assertEqual(self.replay()['pending'],1);process.assert_not_called()
        self.assertTrue(self.marker().exists())

    def test_duplicate_save_and_concurrent_replays_do_not_double_deliver(self):
        self.save();self.save()
        def deliver(*_args,**_kwargs):time.sleep(.05);return self.response()
        with patch.object(pending.subprocess,'run',side_effect=deliver) as process:
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:self.replay(),range(2)))
            self.assertEqual(process.call_count,1)
        self.assertEqual(sum(x['delivered'] for x in results),1)
        self.assertFalse(self.marker().exists())

    def test_crash_after_server_ack_replays_idempotently_if_local_archive_failed(self):
        self.save();original=pending._write
        def failed_archive(path,value):
            if path.parent.name=='delivered-results':raise OSError('synthetic disk full')
            original(path,value)
        with patch.object(pending.subprocess,'run',return_value=self.response()),patch.object(pending,'_write',side_effect=failed_archive):
            self.assertEqual(self.replay()['pending'],1)
        with patch.object(pending.subprocess,'run',return_value=self.response()):self.assertEqual(self.replay()['delivered'],1)

    def test_duplicate_success_after_delivery_does_not_recreate_pending_marker(self):
        self.save()
        with patch.object(pending.subprocess,'run',return_value=self.response()):self.replay()
        self.save();self.assertFalse(self.marker().exists())

    def test_concurrent_duplicate_saves_are_one_durable_marker(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:self.save(),range(2)))
        self.assertEqual(pending.pending_run_ids(self.state),{RUN})

    def test_credential_symlinks_are_refused_without_reading_target(self):
        self.save();target=self.root/'private-token';self.credential.rename(target);self.credential.symlink_to(target)
        with patch.object(pending.subprocess,'run') as process:
            self.assertTrue(self.replay()['blocked']);process.assert_not_called()
        self.assertTrue(self.marker().exists())

    def test_real_child_boundary_classifies_409_and_sends_exact_success_body_without_http(self):
        self.save();fake=self.root/'fake-client.py';record=self.root/'request.json'
        fake.write_text(f"""import importlib.util,json,urllib.error
from pathlib import Path
spec=importlib.util.spec_from_file_location('real_client',{str(pending.CLIENT)!r});real=importlib.util.module_from_spec(spec);spec.loader.exec_module(real)
read_private=real.read_private
validate_worker=real.validate_worker
run_url=real.run_url
def report_body(worker,result):
 real.run_url=run_url
 return real.report_body(worker,result)
def request(endpoint,body):
 Path({str(record)!r}).write_text(json.dumps({{'endpoint':endpoint,'body':body}}))
 raise urllib.error.HTTPError('https://example.invalid/result',409,'synthetic-conflict-secret',None,None)
""")
        result=pending.replay_pending(self.state,fake,self.credential)
        self.assertEqual(result,{'pending':1,'delivered':0,'blocked':True})
        request=json.loads(record.read_text());self.assertEqual(request['endpoint'],'result');self.assertEqual(request['body'],self.receipt)
        self.assertEqual(json.loads(self.marker().read_text())['reason'],'claim_conflict')

    def test_child_protocol_posts_only_pr_created_and_classifies_409(self):
        self.assertIn("client.request('result',body)",pending._DELIVER)
        self.assertNotIn("outcome='failed'",pending._DELIVER)
        self.assertIn("error.code==409",pending._DELIVER)

if __name__=='__main__':unittest.main(verbosity=2)
