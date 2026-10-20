"""Adversarial transport tests; synthetic credentials and localhost only."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import runpy
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'incident-worker-client.py'
spec = importlib.util.spec_from_file_location('incident_worker_client', SOURCE)
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)
TOKEN = 'synthetic-worker-credential-never-real-00000000'
IDENTITY = {'GITHUB_REPOSITORY': client.REPO, 'GITHUB_RUN_ID': '123456789'}
LOCAL_RUN_ID = '12345678-1234-4567-89ab-123456789abc'
LOCAL_IDENTITY = {'GITHUB_REPOSITORY': client.REPO, 'INCIDENT_LOCAL_RUN_ID': LOCAL_RUN_ID}


def worker():
    value = {
        'version': 1, 'incidentId': 'incident_01', 'provider': 'codex',
        'service': 'api', 'message': 'Falló dirección: café, 中文, 🛒',
        'stack': 'Error: synthetic\n/pedido\u2028línea', 'route': '/tienda',
        'proposal': {'summary': 'Revisar dirección 📍', 'requiresHumanApproval': True,
                     'autoFixAllowed': False, 'testPlan': ['Prueba sintética', 'Sin pagos reales']},
        'applied': False, 'requiresReview': True,
        'execution': 'external-isolated-worker-required',
        'handoffId': 'handoff_01', 'claimId': '12345678-1234-4567-89ab-123456789abc',
        'leaseExpiresAt': (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
    }
    value['payloadDigest'] = hashlib.sha256(client.canonical({k: value[k] for k in client.BASE_KEYS})).hexdigest()
    return value


def result_for(value):
    return {**{k: value[k] for k in ('incidentId', 'claimId', 'payloadDigest')},
            'outcome': 'pr_created',
            'runUrl': f'https://github.com/{client.REPO}/actions/runs/{IDENTITY["GITHUB_RUN_ID"]}',
            'prUrl': f'https://github.com/{client.REPO}/pull/123',
            'baseSha': 'a' * 40, 'patchSha': 'b' * 64}


class CodecAndWorkerTests(unittest.TestCase):
    def test_valid_unicode_worker_roundtrips_and_digest_matches_node_contract(self):
        value = worker()
        self.assertEqual(client.validate_worker(client.decode(client.canonical(value))), value)
        payload = {k: value[k] for k in client.BASE_KEYS}
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node is required for cross-language digest verification')
        code = """const fs=require('node:fs'),crypto=require('node:crypto');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
process.stdout.write(crypto.createHash('sha256').update(canonical(JSON.parse(fs.readFileSync(0,'utf8'))),'utf8').digest('hex'));"""
        completed = subprocess.run([node, '-e', code], input=client.canonical(payload),
                                   capture_output=True, timeout=5, env={'PATH': os.defpath})
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())
        self.assertEqual(completed.stdout.decode(), value['payloadDigest'])
        self.assertIn('🛒'.encode(), client.canonical(value))
        self.assertEqual(client.canonical({'z': [False, None], 'a': 'ñ'}), b'{"a":"\xc3\xb1","z":[false,null]}')

    def test_decode_refuses_duplicate_keys_at_every_depth_invalid_numbers_encoding_and_size(self):
        for data in [b'{"x":1,"x":2}', b'{"proposal":{"summary":"a","summary":"b"}}',
                     b'{"n":NaN}', b'{"n":Infinity}', b'{"n":-Infinity}', b'\xff',
                     b'{' + b' ' * 65536 + b'}', b'{']:
            with self.subTest(data=data[:60]), self.assertRaises((ValueError, UnicodeError)):
                client.decode(data)

    def test_worker_schema_rejects_unsafe_modes_unknown_fields_and_identity_values(self):
        changes = [('version', True), ('version', 2), ('provider', 'kimi'),
                   ('execution', 'run-on-api'), ('applied', True), ('requiresReview', False),
                   ('incidentId', '../escape'), ('handoffId', ''), ('claimId', 'not-a-uuid'),
                   ('payloadDigest', 'A' * 64), ('message', 7), ('stack', []),
                   ('route', 'x' * 1001), ('service', 'x' * 201)]
        for key, bad in changes:
            with self.subTest(key=key, value=bad), self.assertRaises((ValueError, TypeError, AttributeError)):
                value = worker()
                value[key] = bad
                client.validate_worker(value)
        for value in [[], None, {**worker(), 'unexpected': True}]:
            with self.subTest(value=type(value)), self.assertRaises(ValueError):
                client.validate_worker(value)
        value = worker()
        del value['route']
        with self.assertRaises(ValueError):
            client.validate_worker(value)

    def test_worker_rejects_expired_malformed_naive_leases_and_payload_tampering(self):
        for expiry in ['2000-01-01T00:00:00Z', 'invalid', '2099-01-01T00:00:00', None]:
            with self.subTest(expiry=expiry), self.assertRaises((ValueError, TypeError, AttributeError)):
                value = worker()
                value['leaseExpiresAt'] = expiry
                client.validate_worker(value)
        value = worker()
        value['proposal']['summary'] = 'tampered'
        with self.assertRaisesRegex(ValueError, 'digest'):
            client.validate_worker(value)

    def test_worker_requires_human_review_proposal_and_nonempty_testplan(self):
        for key, bad in [('summary', ''), ('summary', None), ('requiresHumanApproval', False),
                         ('autoFixAllowed', True), ('testPlan', []), ('testPlan', ['']),
                         ('testPlan', [42])]:
            with self.subTest(key=key, bad=bad), self.assertRaises(ValueError):
                value = worker()
                value['proposal'][key] = bad
                client.validate_worker(value)


class PrivateArtifactTests(unittest.TestCase):
    def test_private_write_is_exclusive_0600_and_roundtrips(self):
        with tempfile.TemporaryDirectory(prefix='incident-client-test-') as temp:
            path = Path(temp) / 'private' / 'worker.json'
            client.write_private(path, worker())
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
            self.assertEqual(client.validate_worker(client.read_private(path))['incidentId'], 'incident_01')
            original = path.read_bytes()
            with self.assertRaises(FileExistsError):
                client.write_private(path, {'overwrite': True})
            self.assertEqual(path.read_bytes(), original)

    def test_symlink_files_and_symlink_parent_components_are_refused(self):
        with tempfile.TemporaryDirectory(prefix='incident-client-test-') as temp:
            root = Path(temp)
            target = root / 'target.json'
            client.write_private(target, worker())
            (root / 'file-link').symlink_to(target)
            real = root / 'real'
            real.mkdir()
            (root / 'dir-link').symlink_to(real, target_is_directory=True)
            for path in [root / 'file-link', root / 'dir-link' / 'new.json']:
                with self.subTest(path=path), self.assertRaises(ValueError):
                    client.write_private(path, worker())
                with self.subTest(read=path), self.assertRaises(ValueError):
                    client.read_private(path)
            self.assertFalse((real / 'new.json').exists())

    def test_special_fifo_is_refused_without_blocking_before_fstat(self):
        with tempfile.TemporaryDirectory(prefix='incident-client-test-') as temp:
            fifo = Path(temp) / 'worker.pipe'
            os.mkfifo(fifo, 0o600)
            code = "import importlib.util,sys; spec=importlib.util.spec_from_file_location('client',sys.argv[1]); client=importlib.util.module_from_spec(spec); spec.loader.exec_module(client)\ntry: client.read_private(sys.argv[2])\nexcept ValueError: sys.exit(0)\nsys.exit(1)"
            completed = subprocess.run([sys.executable, '-c', code, str(SOURCE), str(fifo)],
                                       capture_output=True, timeout=2, env={'PATH': os.defpath})
            self.assertEqual(completed.returncode, 0, completed.stderr.decode())

    def test_relative_paths_directories_and_oversized_documents_are_refused(self):
        for operation in [client.read_private, lambda p: client.write_private(p, worker())]:
            with self.assertRaises(ValueError):
                operation('relative.json')
        with tempfile.TemporaryDirectory(prefix='incident-client-test-') as temp:
            with self.assertRaises((ValueError, OSError)):
                client.read_private(temp)
            path = Path(temp) / 'large.json'
            path.write_bytes(b' ' * 65537)
            with self.assertRaises(ValueError):
                client.read_private(path)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'INCIDENT_WORKER_TOKEN': TOKEN}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_request_scopes_credential_to_fixed_origin_and_post_endpoint(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit):
                self.limit = limit
                return b'{"handoff":null}'
        response = Response()
        with patch.object(client.urllib.request, 'build_opener') as factory:
            factory.return_value.open.return_value = response
            self.assertEqual(client.request('claim', {}), {'handoff': None})
            req = factory.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, client.ORIGIN + '/internal/incident-worker/claim')
            self.assertEqual(req.get_header('Authorization'), 'Bearer ' + TOKEN)
            self.assertEqual(req.get_method(), 'POST')
            self.assertEqual(req.data, b'{}')
            self.assertEqual(factory.return_value.open.call_args.kwargs, {'timeout': 30})
            self.assertEqual(response.limit, 65537)
            self.assertIs(factory.call_args.args[0], client.NoRedirect)

    def test_bad_credentials_and_untrusted_origins_fail_before_network(self):
        cases = [{'INCIDENT_WORKER_TOKEN': 'short'}, {'INCIDENT_WORKER_TOKEN': TOKEN + '\r\nx:bad'},
                 {'INCIDENT_WORKER_ORIGIN': 'https://evil.example'},
                 {'INCIDENT_WORKER_ORIGIN': client.ORIGIN + '.evil.example'},
                 {'INCIDENT_WORKER_ORIGIN': client.ORIGIN + '/@evil.example'},
                 {'INCIDENT_WORKER_ORIGIN': 'http://127.0.0.1:1234'},
                 {'INCIDENT_WORKER_ORIGIN': 'http://localhost:1234', 'INCIDENT_WORKER_TEST_MODE': 'true'},
                 {'INCIDENT_WORKER_ORIGIN': 'http://127.0.0.1:1234@evil.example', 'INCIDENT_WORKER_TEST_MODE': 'true'}]
        for values in cases:
            with self.subTest(values=values), patch.dict(os.environ, values), patch.object(client.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    client.request('claim', {})
                opener.assert_not_called()

    def test_http_redirect_never_forwards_worker_credential_to_another_server(self):
        seen = []
        class Target(BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(self.headers.get('Authorization'))
                self.send_response(200)
                self.end_headers()
            def do_POST(self): self.do_GET()
            def log_message(self, *_): pass
        target = ThreadingHTTPServer(('127.0.0.1', 0), Target)
        class Redirect(BaseHTTPRequestHandler):
            def do_POST(self):
                self.send_response(302)
                self.send_header('Location', f'http://127.0.0.1:{target.server_port}/steal')
                self.end_headers()
            def log_message(self, *_): pass
        source = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        for server in [target, source]:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
        with patch.dict(os.environ, {'INCIDENT_WORKER_TEST_MODE': 'true', 'INCIDENT_WORKER_ORIGIN': f'http://127.0.0.1:{source.server_port}'}):
            with self.assertRaisesRegex(ValueError, 'redirect'):
                client.request('claim', {})
        self.assertEqual(seen, [])

    def test_cli_hides_credentials_and_payload_even_when_transport_exception_contains_them(self):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', [str(SOURCE), 'claim', '--worker', '/tmp/unused-worker.json']), \
             patch('urllib.request.build_opener', side_effect=RuntimeError(TOKEN + ' private diagnostic')), \
             redirect_stdout(out), redirect_stderr(err), self.assertRaises(SystemExit) as raised:
            runpy.run_path(str(SOURCE), run_name='__main__')
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(out.getvalue(), '')
        self.assertNotIn(TOKEN, err.getvalue())
        self.assertNotIn('private diagnostic', err.getvalue())
        self.assertIn('credentials and payload withheld', err.getvalue())


class ResultIdentityTests(unittest.TestCase):
    def test_valid_result_and_failed_report_are_bound_to_run_and_claim(self):
        value = worker()
        with patch.dict(os.environ, IDENTITY, clear=True):
            self.assertEqual(client.report_body(value, result_for(value)), result_for(value))
            body = client.report_body(value)
            self.assertEqual(body['outcome'], 'failed')
            self.assertEqual(body['claimId'], value['claimId'])
            self.assertEqual(body['payloadDigest'], value['payloadDigest'])
            self.assertNotIn('prUrl', body)

    def test_mismatched_claim_digest_run_pr_origin_and_malformed_hashes_are_refused(self):
        value = worker()
        changes = [('incidentId', 'other'), ('claimId', 'other'), ('payloadDigest', 'c' * 64),
                   ('runUrl', 'https://github.com/Other/repo/actions/runs/1'),
                   ('prUrl', 'https://github.com/Gaes-Solutions/verticals.evil/pull/1'),
                   ('prUrl', 'https://evil.example/pull/1'),
                   ('prUrl', f'https://github.com/{client.REPO}/pull/0'),
                   ('prUrl', f'https://github.com/{client.REPO}/pull/0123'),
                   ('outcome', 'approved'),
                   ('baseSha', 'a' * 39), ('baseSha', 'A' * 40),
                   ('patchSha', 'b' * 63), ('patchSha', 'B' * 64)]
        with patch.dict(os.environ, IDENTITY, clear=True):
            for key, bad in changes:
                with self.subTest(key=key, bad=bad), self.assertRaises(ValueError):
                    result = result_for(value)
                    result[key] = bad
                    client.report_body(value, result)
            for result in [None, [], {**result_for(value), 'approved': True}]:
                if result is None:
                    continue
                with self.subTest(type=type(result)), self.assertRaises(ValueError):
                    client.report_body(value, result)

    def test_local_result_and_failed_report_use_a_uuid_urn_without_fabricated_github_run(self):
        value = worker()
        result = {**result_for(value), 'runUrl': f'urn:gaes:incident-worker:{LOCAL_RUN_ID}'}
        with patch.dict(os.environ, LOCAL_IDENTITY, clear=True):
            self.assertNotIn('GITHUB_RUN_ID', os.environ)
            self.assertEqual(client.run_url(), result['runUrl'])
            self.assertEqual(client.report_body(value, result), result)
            failed = client.report_body(value)
            self.assertEqual(failed['runUrl'], result['runUrl'])
            self.assertEqual(failed['outcome'], 'failed')
            self.assertEqual(failed['claimId'], value['claimId'])
            self.assertNotIn('prUrl', failed)

    def test_local_identity_has_priority_even_when_github_run_is_present(self):
        with patch.dict(os.environ, {**IDENTITY, **LOCAL_IDENTITY}, clear=True):
            self.assertEqual(client.run_url(), f'urn:gaes:incident-worker:{LOCAL_RUN_ID}')

    def test_invalid_local_identity_fails_closed_instead_of_using_valid_github_run(self):
        invalid = ['', 'not-a-uuid', LOCAL_RUN_ID.upper(),
                   '12345678-1234-1567-89ab-123456789abc',
                   '12345678-1234-4567-79ab-123456789abc',
                   '00000000-0000-0000-0000-000000000000',
                   'https://localhost/run', 'javascript:alert(1)',
                   LOCAL_RUN_ID + '?token=secret', LOCAL_RUN_ID + '\n']
        for local_id in invalid:
            with self.subTest(local_id=local_id), patch.dict(os.environ, {**IDENTITY, 'INCIDENT_LOCAL_RUN_ID': local_id}, clear=True):
                with self.assertRaises(ValueError):
                    client.run_url()
                with self.assertRaises(ValueError):
                    client.report_body(worker())

    def test_local_run_still_requires_the_fixed_repository(self):
        for repo in ['', 'Other/repo', client.REPO + '.evil', client.REPO.lower()]:
            with self.subTest(repo=repo), patch.dict(os.environ, {**LOCAL_IDENTITY, 'GITHUB_REPOSITORY': repo}, clear=True):
                with self.assertRaises(ValueError):
                    client.run_url()

    def test_local_result_rejects_other_urns_github_runs_and_arbitrary_url_schemes(self):
        value = worker()
        bad_urls = [f'urn:gaes:incident-worker:{LOCAL_RUN_ID[:-1]}d',
                    'urn:gaes:incident-worker:not-a-uuid',
                    result_for(value)['runUrl'], 'https://evil.example/run',
                    'http://127.0.0.1/run', 'javascript:alert(1)']
        with patch.dict(os.environ, LOCAL_IDENTITY, clear=True):
            for url in bad_urls:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    client.report_body(value, {**result_for(value), 'runUrl': url})

    def test_untrusted_github_repository_and_non_numeric_run_id_are_refused(self):
        for identity in [{}, {**IDENTITY, 'GITHUB_REPOSITORY': 'evil/repo'},
                         {**IDENTITY, 'GITHUB_RUN_ID': '../1'}, {**IDENTITY, 'GITHUB_RUN_ID': '1\n2'},
                         {**IDENTITY, 'GITHUB_RUN_ID': '0'}, {**IDENTITY, 'GITHUB_RUN_ID': '0123'}]:
            with self.subTest(identity=identity), patch.dict(os.environ, identity, clear=True), self.assertRaises(ValueError):
                client.report_body(worker())


class CommandBoundaryTests(unittest.TestCase):
    def test_no_work_claim_sets_output_false_and_creates_no_worker_artifact(self):
        with tempfile.TemporaryDirectory(prefix='incident-command-test-') as temp:
            path, output = Path(temp) / 'worker.json', Path(temp) / 'output'
            with patch.dict(os.environ, {'GITHUB_OUTPUT': str(output)}, clear=True), \
                 patch.object(sys, 'argv', [str(SOURCE), 'claim', '--worker', str(path)]), \
                 patch.object(client, 'request', return_value={'handoff': None}) as request, redirect_stdout(io.StringIO()):
                client.main()
            request.assert_called_once_with('claim', {})
            self.assertFalse(path.exists())
            self.assertEqual(output.read_text(), 'has_work=false\n')

    def test_valid_claim_is_verified_then_saved_privately_and_marks_work(self):
        with tempfile.TemporaryDirectory(prefix='incident-command-test-') as temp:
            path, output = Path(temp) / 'worker.json', Path(temp) / 'output'
            value = worker()
            with patch.dict(os.environ, {'GITHUB_OUTPUT': str(output)}, clear=True), \
                 patch.object(sys, 'argv', [str(SOURCE), 'claim', '--worker', str(path)]), \
                 patch.object(client, 'request', return_value={'handoff': value}), redirect_stdout(io.StringIO()):
                client.main()
            self.assertEqual(client.read_private(path), value)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(output.read_text(), 'has_work=true\n')

    def test_malformed_claim_envelopes_never_write_artifacts_or_success_output(self):
        for envelope in [[], {'handoff': None, 'extra': True}, {}, {'handoff': {'malformed': True}}]:
            with self.subTest(envelope=envelope), tempfile.TemporaryDirectory(prefix='incident-command-test-') as temp:
                path, output = Path(temp) / 'worker.json', Path(temp) / 'output'
                with patch.dict(os.environ, {'GITHUB_OUTPUT': str(output)}, clear=True), \
                     patch.object(sys, 'argv', [str(SOURCE), 'claim', '--worker', str(path)]), \
                     patch.object(client, 'request', return_value=envelope), self.assertRaises(ValueError):
                    client.main()
                self.assertFalse(path.exists())
                self.assertFalse(output.exists())

    def test_local_cli_report_keeps_the_eight_field_result_bound_to_its_run(self):
        with tempfile.TemporaryDirectory(prefix='incident-local-command-test-') as temp:
            path, result_path = Path(temp) / 'worker.json', Path(temp) / 'result.json'
            value = worker()
            result = {**result_for(value), 'runUrl': f'urn:gaes:incident-worker:{LOCAL_RUN_ID}'}
            client.write_private(path, value)
            client.write_private(result_path, result)
            with patch.dict(os.environ, LOCAL_IDENTITY, clear=True), \
                 patch.object(sys, 'argv', [str(SOURCE), 'report', '--worker', str(path), '--result', str(result_path)]), \
                 patch.object(client, 'request', return_value={'accepted': True, 'idempotent': False}) as request, redirect_stdout(io.StringIO()):
                client.main()
            request.assert_called_once_with('result', result)
            self.assertEqual(len(request.call_args.args[1]), 8)

    def test_report_validates_ack_and_never_accepts_truthy_values_or_extra_fields(self):
        for ack in [{'accepted': True, 'idempotent': False}, {'accepted': True, 'idempotent': True},
                    {'accepted': 1, 'idempotent': False}, {'accepted': True, 'idempotent': 0},
                    {'accepted': False, 'idempotent': False},
                    {'accepted': True, 'idempotent': False, 'extra': True}, {}]:
            valid = type(ack.get('accepted')) is bool and ack.get('accepted') is True and type(ack.get('idempotent')) is bool and len(ack) == 2
            with self.subTest(ack=ack), tempfile.TemporaryDirectory(prefix='incident-command-test-') as temp:
                path = Path(temp) / 'worker.json'
                value = worker()
                client.write_private(path, value)
                with patch.dict(os.environ, IDENTITY, clear=True), \
                     patch.object(sys, 'argv', [str(SOURCE), 'report', '--worker', str(path)]), \
                     patch.object(client, 'request', return_value=ack) as request, redirect_stdout(io.StringIO()):
                    if valid:
                        client.main()
                    else:
                        with self.assertRaises(ValueError):
                            client.main()
                self.assertEqual(request.call_args.args[0], 'result')
                self.assertEqual(request.call_args.args[1]['outcome'], 'failed')


if __name__ == '__main__':
    unittest.main()
