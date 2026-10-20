#!/usr/bin/env python3
import importlib.util,json,tempfile,time,types,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
s=importlib.util.spec_from_file_location('auditcoord',Path(__file__).resolve().parents[1]/'incident-release-audit.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class AuditCoordinator(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def report(self,age=0,overall='passed'):
        value={'baseSha':'a'*40,'policyDigest':'b'*64,'finishedAt':datetime.fromtimestamp(time.time()-age,timezone.utc).isoformat(),'overall':overall}
        m.write_json(self.root/'release-audit.json',value)
    def test_commit_policy_missing_and_daily_expiry_schedule_validation(self):
        self.assertTrue(m.audit_due(self.root,'a'*40,'b'*64));self.report()
        self.assertFalse(m.audit_due(self.root,'a'*40,'b'*64));self.assertTrue(m.audit_due(self.root,'c'*40,'b'*64));self.assertTrue(m.audit_due(self.root,'a'*40,'c'*64))
        self.report(86401);self.assertTrue(m.audit_due(self.root,'a'*40,'b'*64))
    def test_failed_audit_retries_hourly_without_false_green(self):
        self.report(30,'failed');self.assertFalse(m.audit_due(self.root,'a'*40,'b'*64))
        self.report(3601,'failed');self.assertTrue(m.audit_due(self.root,'a'*40,'b'*64))
    def test_failure_findings_are_durable_and_marked_recovered_only_after_pass(self):
        artifacts=self.root/'artifacts';(artifacts/'audit-logs').mkdir(parents=True);(artifacts/'audit-logs/web-unit.log').write_text('synthetic failure')
        report={'version':1,'runId':'synthetic','baseSha':'a'*40,'overall':'failed','finishedAt':datetime.now(timezone.utc).isoformat(),'results':[{'checkId':'web-unit','status':'failed','reason':'command_exit_nonzero','logSha256':'b'*64}]}
        m.save_evidence(self.root,report,artifacts)
        self.assertFalse(json.loads((self.root/'release-audit.json').read_text())['releaseReady'])
        finding=self.root/'audit-findings/web-unit.json';self.assertIsNone(json.loads(finding.read_text())['resolvedAt'])
        report['results'][0]['status']='passed';m.save_evidence(self.root,report,artifacts)
        self.assertIsNotNone(json.loads(finding.read_text())['resolvedAt'])
    def test_timeout_never_passes_unexecuted_checks(self):
        controller=self.root/'controller';(controller/'automation').mkdir(parents=True);(controller/'scripts').mkdir();(controller/'scripts/release-audit.py').write_text('trusted')
        (controller/'automation/release-audit-matrix.json').write_text(json.dumps({'checks':[{'id':'one'},{'id':'two'}],'manualRequired':['physical-device']}))
        artifacts=self.root/'artifacts';artifacts.mkdir()
        def command(*a,**kw):return b''
        def container(*a,**kw):raise __import__('subprocess').TimeoutExpired('synthetic',1)
        w=types.SimpleNamespace(state=self.root,controller=controller,artifacts=artifacts,run_id='run-one',container=container)
        with patch.object(m,'worker_command',side_effect=command):result=m.run_audit(w,self.root,'a'*40)
        self.assertEqual(result['overall'],'incomplete');self.assertTrue(all(r['status']=='blocked' for r in result['results']))
        self.assertFalse(result['releaseReady'])
    def test_interrupted_incremental_report_keeps_completed_passes(self):
        import hashlib
        controller=self.root/'controller';(controller/'automation').mkdir(parents=True);(controller/'scripts').mkdir();(controller/'scripts/release-audit.py').write_text('trusted')
        matrix=controller/'automation/release-audit-matrix.json';matrix.write_text(json.dumps({'checks':[{'id':'one'},{'id':'two'}],'manualRequired':['physical-device']}))
        artifacts=self.root/'artifacts';artifacts.mkdir()
        def container(*a,**kw):
            m.write_json(artifacts/'release-audit.json',{'baseSha':'a'*40,'controllerMatrixSha256':hashlib.sha256(matrix.read_bytes()).hexdigest(),'results':[{'checkId':'one','status':'passed','durationMs':2,'exitCode':0,'logSha256':'b'*64},{'checkId':'two','status':'notrun','durationMs':0,'exitCode':None,'logSha256':None}]})
            raise __import__('subprocess').TimeoutExpired('synthetic',1)
        w=types.SimpleNamespace(state=self.root,controller=controller,artifacts=artifacts,run_id='run-partial',container=container)
        with patch.object(m,'worker_command',return_value=b''): result=m.run_audit(w,self.root,'a'*40)
        self.assertEqual(result['overall'],'incomplete');self.assertEqual(result['counts'],{'passed':1,'failed':0,'blocked':1})
        self.assertEqual(result['results'][1]['reason'],'check_not_executed')
if __name__=='__main__':unittest.main()
