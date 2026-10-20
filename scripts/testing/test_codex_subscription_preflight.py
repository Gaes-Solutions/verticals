#!/usr/bin/env python3
"""Quota preflight regression tests; every app-server is a local fake, no inference."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]/'codex-subscription-preflight.py'
spec = importlib.util.spec_from_file_location('subscription_preflight', SOURCE)
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)


def account(): return {'account': {'type': 'chatgpt', 'planType': 'prolite', 'email': 'synthetic-private@example.invalid', 'id': 'synthetic-account-secret'}, 'requiresOpenaiAuth': True}

def limits():
    reset = int(time.time())+3600
    return {'ordinaryUsageAllowed': True, 'accountId': 'synthetic-account-secret', 'rateLimitsByLimitId': {'codex': {'limitId': 'codex', 'planType': 'prolite', 'primary': {'usedPercent': 50, 'windowDurationMins': 300, 'resetsAt': reset}, 'secondary': {'usedPercent': 75, 'windowDurationMins': 10080, 'resetsAt': reset+3600}, 'credits': {'hasCredits': False, 'unlimited': False}, 'rateLimitReachedType': None}}, 'rateLimitResetCredits': {'availableCount': 100}}


class Assessment(unittest.TestCase):
    def test_ready_only_known_included_quota_without_extra_wallet(self):
        out=gate.assess(account(), limits()); self.assertEqual(out['status'],'ready'); self.assertEqual(out['remainingPercent'],25)
        self.assertEqual(set(out),{'status','reason','retryAt','remainingPercent'})
        self.assertNotIn('synthetic-',json.dumps(out))
    def test_explicit_null_secondary_is_documented_not_applicable(self):
        data=limits(); data['rateLimitsByLimitId']['codex']['secondary']=None
        self.assertEqual(gate.assess(account(),data)['status'],'ready')
    def test_primary_null_secondary_known_is_allowed_but_both_null_are_unknown(self):
        data=limits(); data['rateLimitsByLimitId']['codex']['primary']=None
        self.assertEqual(gate.assess(account(),data)['status'],'ready')
        data['rateLimitsByLimitId']['codex']['secondary']=None
        self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_missing_secondary_is_not_treated_as_null(self):
        data=limits(); del data['rateLimitsByLimitId']['codex']['secondary']
        self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_threshold_waits_until_all_low_windows_reset_without_spending_credits(self):
        data=limits(); b=data['rateLimitsByLimitId']['codex']; b['primary']['usedPercent']=95; b['secondary']['usedPercent']=99
        out=gate.assess(account(),data); self.assertEqual(out['status'],'wait'); self.assertEqual(out['remainingPercent'],1)
        self.assertTrue(out['retryAt'].endswith('Z'))
    def test_exact_reserve_is_allowed(self):
        data=limits(); data['rateLimitsByLimitId']['codex']['primary']['usedPercent']=90
        self.assertEqual(gate.assess(account(),data)['status'],'ready')
    def test_unknown_windows_bad_percent_and_stale_reset_fail_closed(self):
        for key,value in [('usedPercent',float('nan')),('usedPercent',True),('usedPercent',101),('windowDurationMins',None),('resetsAt',0)]:
            with self.subTest(key=key,value=value):
                data=limits(); data['rateLimitsByLimitId']['codex']['primary'][key]=value
                self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_ordinary_usage_permission_is_required_even_with_unused_windows(self):
        for value,expected in [(False,'wait'),(None,'unavailable')]:
            data=limits(); data['ordinaryUsageAllowed']=value
            self.assertEqual(gate.assess(account(),data)['status'],expected)
        data=limits(); del data['ordinaryUsageAllowed']; self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_unknown_and_credit_only_plans_fail_closed(self):
        for plan in ['unknown','self_serve_business_usage_based','enterprise_cbp_usage_based','new_plan',None]:
            value=account();value['account']['planType']=plan
            self.assertEqual(gate.assess(value,limits())['status'],'unavailable')
    def test_api_bedrock_and_missing_auth_never_ready(self):
        for value in [None,{'type':'apiKey'},{'type':'amazonBedrock'}]:
            self.assertEqual(gate.assess({'account':value},limits())['status'],'auth_required')
    def test_extra_credit_wallet_or_unknown_wallet_disables_execution(self):
        for credits in [None,{'hasCredits':True,'unlimited':False},{'hasCredits':False,'unlimited':True},{}]:
            data=limits(); data['rateLimitsByLimitId']['codex']['credits']=credits
            self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_unrelated_bucket_never_authorizes_default_codex(self):
        data=limits();data['rateLimitsByLimitId']={'other':data['rateLimitsByLimitId']['codex']}
        self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_fallback_single_bucket_schema_and_plan_mismatch(self):
        data=limits();data['rateLimits']=data.pop('rateLimitsByLimitId')['codex']
        self.assertEqual(gate.assess(account(),data)['status'],'ready')
        data['rateLimits']['planType']='plus';self.assertEqual(gate.assess(account(),data)['status'],'unavailable')
    def test_server_spend_or_rate_limit_flags_override_percentages(self):
        for key,value in [('spendControlReached',True),('rateLimitReachedType','workspace_owner_credits_depleted')]:
            data=limits();data['rateLimitsByLimitId']['codex'][key]=value
            self.assertEqual(gate.assess(account(),data)['status'],'wait')


class Protocol(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='gaes-subscription-test-');self.root=Path(self.temp.name)
        self.home=self.root/'private-auth';self.home.mkdir(mode=0o700)
        self.auth=self.home/'auth.json';self.auth.write_text(json.dumps({'auth_mode':'chatgpt','OPENAI_API_KEY':None,'tokens':{'access_token':'synthetic-access-secret'}}));self.auth.chmod(0o600)
        self.binary=self.root/'codex';self.log=self.root/'requests.jsonl';self.fake()
    def tearDown(self): self.temp.cleanup()
    def fake(self,account_data=None,limit_data=None,notification=None,attack='',version='0.163.0'):
        self.binary.write_text('''#!/usr/bin/env python3
import json,sys,os,time
from pathlib import Path
if '--version' in sys.argv: print('codex-cli VERSION');sys.exit(0)
assert 'app-server' in sys.argv and 'exec' not in sys.argv
assert 'forced_login_method="chatgpt"' in sys.argv
assert not any(x in os.environ for x in ['OPENAI_API_KEY','CODEX_API_KEY','ACCESS_TOKEN','GH_TOKEN','BREVO_API_KEY','RESEND_API_KEY','OPENAI_BASE_URL','NODE_OPTIONS'])
print('synthetic-stderr-secret',file=sys.stderr)
for line in sys.stdin:
 value=json.loads(line)
 with Path(LOGFILE).open('a') as f:f.write(json.dumps(value)+'\\n')
 if value['method']=='initialized':continue
 ATTACK
 if NOTIFICATION is not None:print(json.dumps(NOTIFICATION),flush=True)
 if value['method']=='initialize':result={'userAgent':'synthetic'}
 elif value['method']=='account/read':result=ACCOUNT
 elif value['method']=='account/rateLimits/read':result=LIMITS
 else:raise Exception('forbidden mutation/inference method')
 print(json.dumps({'id':value['id'],'result':result}),flush=True)
'''.replace('VERSION',version).replace('LOGFILE',repr(str(self.log))).replace('ATTACK',attack or 'pass').replace('NOTIFICATION',repr(notification)).replace('ACCOUNT',repr(account() if account_data is None else account_data)).replace('LIMITS',repr(limits() if limit_data is None else limit_data)))
        self.binary.chmod(0o755)
    def check(self,**kwargs): return gate.preflight(str(self.binary),str(self.home),**kwargs)
    def test_only_four_readonly_protocol_messages_and_clean_env(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'synthetic-parent-key','GH_TOKEN':'synthetic-gh','NODE_OPTIONS':'--bad-option'}): result=self.check()
        self.assertEqual(result['status'],'ready')
        requests=[json.loads(x) for x in self.log.read_text().splitlines()]
        self.assertEqual([x['method'] for x in requests],['initialize','initialized','account/read','account/rateLimits/read'])
        self.assertIs(requests[2]['params']['refreshToken'],False)
        self.assertNotIn('synthetic-',json.dumps(result))
    def test_future_notifications_are_ignored_without_any_credit_or_inference_calls(self):
        self.fake(notification={'method':'future/quotaNotice','params':{'token':'synthetic-notification-secret'}})
        self.assertEqual(self.check()['status'],'ready')
    def test_auth_mode_change_invalidates_preflight(self):
        self.fake(notification={'method':'account/updated','params':{'authMode':'apikey'}})
        self.assertEqual(self.check()['status'],'auth_required')
    def test_server_requests_are_not_executed(self):
        self.fake(notification={'id':999,'method':'account/chatgptAuthTokens/refresh','params':{'token':'synthetic-secret'}})
        self.assertEqual(self.check()['status'],'unavailable')
    def test_malformed_json_and_partial_lines_fail_bounded(self):
        for attack in ["print('not-json',flush=True);sys.exit(0)","sys.stdout.write('{');sys.stdout.flush();time.sleep(2)"]:
            with self.subTest(attack=attack):
                self.fake(attack=attack); start=time.monotonic(); result=self.check(timeout=.15)
                self.assertEqual(result['status'],'unavailable');self.assertLess(time.monotonic()-start,3)
    def test_nonfinite_json_is_rejected(self):
        self.fake(attack="print('{\"id\":1,\"result\":{\"x\":NaN}}',flush=True);sys.exit(0)")
        self.assertEqual(self.check()['status'],'unavailable')
    def test_error_payload_and_account_secrets_never_printed(self):
        self.fake(attack="print(json.dumps({'id':value['id'],'error':{'message':'synthetic-error-secret'}}),flush=True);sys.exit(0)")
        result=self.check();self.assertEqual(result['status'],'unavailable');self.assertNotIn('synthetic-',json.dumps(result))
    def test_broad_auth_permissions_and_api_auth_are_rejected_before_cli(self):
        self.auth.chmod(0o644);self.assertEqual(self.check()['status'],'auth_required');self.assertFalse(self.log.exists())
        self.auth.chmod(0o600); self.auth.write_text(json.dumps({'auth_mode':'apikey','OPENAI_API_KEY':'synthetic-api-secret'}))
        self.assertEqual(self.check()['status'],'auth_required');self.assertFalse(self.log.exists())
    def test_custom_config_and_auth_symlinks_rejected(self):
        (self.home/'config.toml').write_text('model_provider="paid"');self.assertEqual(self.check()['status'],'unavailable')
        (self.home/'config.toml').unlink();self.auth.rename(self.home/'source-auth');self.auth.symlink_to(self.home/'source-auth')
        self.assertNotEqual(self.check()['status'],'ready')
    def test_wrong_cli_version_and_invalid_threshold_never_start_app_server(self):
        self.fake(version='0.164.0');self.assertEqual(self.check()['status'],'unavailable');self.assertFalse(self.log.exists())
        self.fake();self.assertEqual(self.check(minimum=1)['status'],'unavailable');self.assertFalse(self.log.exists())
    def test_parent_home_can_be_private_home_inside_docker(self):
        with patch.dict(os.environ,{'HOME':str(self.home)}):self.assertEqual(self.check()['status'],'ready')


if __name__=='__main__': unittest.main(verbosity=2)
