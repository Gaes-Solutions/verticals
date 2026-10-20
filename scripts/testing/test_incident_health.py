"""Health checks use synthetic HTTP responses and a private temporary HOME."""
import importlib.util
import io
import json
import os
from pathlib import Path
import ssl
import stat
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import urllib.error
import urllib.request

SOURCE = Path(__file__).resolve().parents[1] / 'incident-health.py'
spec = importlib.util.spec_from_file_location('incident_health', SOURCE)
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)
NOW = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)


class Response:
    def __init__(self, body=b'', code=200):
        self.body = body
        self.code = code
        self.reads = []
        self.closed = False

    def __enter__(self): return self
    def __exit__(self, *args): self.closed = True
    def read(self, limit):
        self.reads.append(limit)
        return self.body[:limit]


class FakeTransport:
    def __init__(self, overrides=None):
        self.overrides = overrides or {}
        self.calls = []
        self.responses = []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        check = next(check for check in health.CHECKS if check[1] == request.full_url)
        check_id, url, expected, kind = check
        if check_id in self.overrides:
            value = self.overrides[check_id]
            if isinstance(value, Exception):
                raise value
            response = value
        elif kind == 'health':
            response = Response(b'{"status":"ok"}')
        elif kind == 'ready':
            response = Response(b'{"status":"ready","checks":{"masterDb":"ok"}}')
        elif kind == 'unauthorized':
            raise urllib.error.HTTPError(url, 401, 'private provider text', {}, io.BytesIO(b'private response'))
        else:
            response = Response(b'<!DOCTYPE html><html><body>synthetic</body></html>')
        self.responses.append(response)
        return response


class RequestTests(unittest.TestCase):
    def check(self, check_id, transport):
        check = next(value for value in health.CHECKS if value[0] == check_id)
        return health.check_once(check, NOW.isoformat(), lambda: transport)

    def test_seven_exact_readonly_gets_have_no_credentials_cookies_or_redirects(self):
        transport = FakeTransport()
        for check in health.CHECKS:
            result = health.check_once(check, NOW.isoformat(), lambda: transport)
            self.assertEqual(result['status'], 'ok')
            self.assertEqual(result['httpStatus'], check[2])
        self.assertEqual(len(transport.calls), 7)
        self.assertEqual({request.full_url for request, _ in transport.calls}, {check[1] for check in health.CHECKS})
        for request, timeout in transport.calls:
            self.assertEqual(request.get_method(), 'GET')
            self.assertIsNone(request.data)
            self.assertEqual(set(dict(request.header_items())), {'User-agent'})
            self.assertEqual(timeout, 10)
        self.assertTrue(all(response.closed for response in transport.responses))
        self.assertTrue(all(response.reads == [65536] for response in transport.responses))

    def test_opener_verifies_tls_and_disables_environment_proxies_and_redirects(self):
        with patch.object(health.urllib.request, 'build_opener') as build:
            health.opener()
        handlers = build.call_args.args
        proxy = next(handler for handler in handlers if isinstance(handler, urllib.request.ProxyHandler))
        https = next(handler for handler in handlers if isinstance(handler, urllib.request.HTTPSHandler))
        redirect = next(handler for handler in handlers if isinstance(handler, health.NoRedirect))
        self.assertEqual(proxy.proxies, {})
        self.assertEqual(https._context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(https._context.check_hostname)
        with self.assertRaises(health.RedirectRefused):
            redirect.redirect_request(None, None, 302, '', {}, 'https://evil.example/private')

    def test_transport_errors_are_typed_and_never_store_exception_text(self):
        for failure, reason in [(TimeoutError('private-api-key'), 'transport_error'),
                                (ssl.SSLError('private TLS diagnostic'), 'transport_error'),
                                (health.RedirectRefused('private redirected content'), 'redirect_refused')]:
            with self.subTest(reason=reason):
                result = self.check('api', FakeTransport({'api': failure}))
                self.assertEqual(result['reason'], reason)
                self.assertIsNone(result['httpStatus'])
                self.assertNotIn('private', json.dumps(result))

    def test_http_failures_preserve_only_status_and_do_not_read_provider_bodies(self):
        response = Response(b'password=private-secret', 503)
        result = self.check('api-ready', FakeTransport({'api-ready': response}))
        self.assertEqual(result['reason'], 'http_status')
        self.assertEqual(result['httpStatus'], 503)
        self.assertEqual(response.reads, [])
        self.assertNotIn('private', json.dumps(result))
        self.assertTrue(response.closed)

    def test_success_status_requires_the_expected_json_health_and_database_contract(self):
        cases = [('api', b'{"status":"unhealthy"}', 'invalid_health'),
                 ('api', b'[]', 'invalid_health'), ('api', b'not json private content', 'invalid_json'),
                 ('api-ready', b'{"status":"ready","checks":{"masterDb":"error"}}', 'invalid_ready'),
                 ('api-ready', b'{"status":"ready","checks":[]}', 'invalid_ready'),
                 ('api-ready', b'{"status":"ok"}', 'invalid_ready')]
        for check_id, body, reason in cases:
            with self.subTest(check_id=check_id, body=body):
                result = self.check(check_id, FakeTransport({check_id: Response(body)}))
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['reason'], reason)
                self.assertNotIn('private content', json.dumps(result))

    def test_large_html_uses_only_64k_prefix_but_large_json_is_refused(self):
        response = Response(b'<!DOCTYPE html><html>' + b'x' * 200000)
        result = self.check('storefront', FakeTransport({'storefront': response}))
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(response.reads, [65536])
        json_response = Response(b'{"status":"ok"}' + b' ' * 100000)
        result = self.check('api', FakeTransport({'api': json_response}))
        self.assertEqual(result['reason'], 'response_too_large')
        self.assertEqual(json_response.reads, [65536])

    def test_webpages_require_an_html_prefix_and_auth_check_rejects_accidental_public_access(self):
        for body in [b'', b'{"error":"<html>private</html>"}', b'plain error']:
            result = self.check('admin', FakeTransport({'admin': Response(body)}))
            self.assertEqual(result['reason'], 'invalid_html')
        self.assertEqual(self.check('pos', FakeTransport({'pos': Response(b'\xef\xbb\xbf  <html lang="es">')}))['status'], 'ok')
        result = self.check('incident-auth', FakeTransport({'incident-auth': Response(b'private customer data', 200)}))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['reason'], 'http_status')
        self.assertNotIn('customer', json.dumps(result))


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gaes-health-test-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.state = self.home / '.local/share/gaes-incident-local'
        self.state.mkdir(mode=0o700, parents=True)
        for parent in (self.state, *self.state.parents):
            if parent == self.home.parent: break
            parent.chmod(0o700)

    def run_health(self, overrides=None, now=NOW):
        return health.run_health(self.state, home=self.home, now=now, make_opener=lambda: FakeTransport(overrides))

    def test_healthy_snapshot_is_private_typed_and_independent_of_worker_busy_or_quota(self):
        worker = self.state / 'status.json'
        worker.write_text('{"status":"busy","remainingPercent":0}')
        worker.chmod(0o600)
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'private-model', 'DATABASE_URL_MASTER': 'private-db', 'GH_TOKEN': 'private-gh', 'INCIDENT_WORKER_TOKEN': 'private-worker'}):
            report = self.run_health()
        self.assertEqual(report['status'], 'healthy')
        self.assertEqual(len(report['checks']), 7)
        snapshot = self.state / 'health.json'
        self.assertEqual(json.loads(snapshot.read_text()), report)
        self.assertEqual(stat.S_IMODE(snapshot.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((self.state / 'health-findings').stat().st_mode), 0o700)
        self.assertEqual(list((self.state / 'health-findings').iterdir()), [])
        self.assertNotIn('private', snapshot.read_text())
        self.assertEqual(json.loads(worker.read_text())['status'], 'busy')

    def test_failure_tracks_occurrences_recovery_and_recurrence_without_raw_content(self):
        response = lambda: Response(b'Authorization: Bearer private-secret', 503)
        first = self.run_health({'api': response()})
        self.assertEqual(first['status'], 'degraded')
        path = self.state / 'health-findings/api.json'
        finding = json.loads(path.read_text())
        self.assertEqual(finding['occurrences'], 1)
        self.assertIsNone(finding['resolvedAt'])
        self.assertEqual(finding['firstSeen'], NOW.isoformat())
        second_at = NOW + timedelta(minutes=10)
        self.run_health({'api': response()}, second_at)
        finding = json.loads(path.read_text())
        self.assertEqual(finding['occurrences'], 2)
        self.assertEqual(finding['firstSeen'], NOW.isoformat())
        self.assertEqual(finding['lastSeen'], second_at.isoformat())
        recovered_at = second_at + timedelta(minutes=10)
        self.run_health(now=recovered_at)
        finding = json.loads(path.read_text())
        self.assertEqual(finding['resolvedAt'], recovered_at.isoformat())
        self.assertEqual(finding['occurrences'], 2)
        self.run_health({'api': response()}, recovered_at + timedelta(minutes=10))
        finding = json.loads(path.read_text())
        self.assertEqual(finding['occurrences'], 3)
        self.assertIsNone(finding['resolvedAt'])
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertNotIn('private-secret', path.read_text())
        self.assertEqual({item.name for item in self.state.iterdir()}, {'health.json', 'health-findings', '.health.lock'})

    def test_outside_home_relative_traversal_and_nonprivate_state_are_refused_before_http(self):
        for path in ['relative', '/tmp/not-home', self.home / '..' / 'escape']:
            with self.subTest(path=path), patch.object(health, 'opener') as opener:
                with self.assertRaises(ValueError): health.run_health(path, home=self.home)
                opener.assert_not_called()
        self.state.chmod(0o755)
        with self.assertRaises(ValueError): self.run_health()

    def test_symlink_findings_snapshot_and_lock_never_touch_the_target(self):
        for name in ['health-findings', 'health.json', '.health.lock']:
            with self.subTest(name=name):
                target = self.home / ('target-' + name)
                if name == 'health-findings': target.mkdir(mode=0o700)
                else:
                    target.write_text('private target')
                    target.chmod(0o600)
                link = self.state / name
                if link.exists() or link.is_symlink():
                    link.unlink()
                link.symlink_to(target, target_is_directory=target.is_dir())
                with self.assertRaises(ValueError): self.run_health()
                self.assertEqual(list(target.iterdir()) if target.is_dir() else target.read_text(), [] if target.is_dir() else 'private target')
                link.unlink()

    def test_corrupt_findings_and_nonprivate_files_are_refused_without_replacing_them(self):
        self.run_health({'api': Response(code=503)})
        path = self.state / 'health-findings/api.json'
        path.write_text('{"private":"do not propagate"}')
        with self.assertRaises(ValueError): self.run_health()
        self.assertEqual(path.read_text(), '{"private":"do not propagate"}')
        path.unlink()
        self.run_health()
        snapshot = self.state / 'health.json'
        snapshot.chmod(0o644)
        with self.assertRaises(ValueError): self.run_health()

    def test_atomic_writes_fsync_files_directories_and_leave_no_temporary_files(self):
        with patch.object(health.os, 'fsync', wraps=os.fsync) as fsync:
            self.run_health({'admin': Response(code=503)})
        self.assertGreaterEqual(fsync.call_count, 4)
        self.assertFalse(any(item.name.startswith('.health.json.') for item in self.state.iterdir()))
        self.assertFalse(any(item.name.startswith('.') for item in (self.state / 'health-findings').iterdir()))


if __name__ == '__main__':
    unittest.main()
