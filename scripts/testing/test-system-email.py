"""Contract checks; no messages leave the machine."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("mailer", Path(__file__).parents[1] / "send-system-email.py")
mailer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mailer)


class EmailContract(unittest.TestCase):
    message = {"subject": "Prueba", "text": "Texto", "html": "<p>Texto</p>"}
    env = {"BREVO_API_KEY": "fake-brevo", "RESEND_API_KEY": "fake-resend",
           "EMAIL_REMITENTE": "Gaesland <tienda@example.invalid>",
           "INCIDENT_ALERT_EMAIL": "alerta@example.invalid"}

    @patch.object(mailer, "urlopen")
    def test_brevo_precedence_and_contract(self, send):
        send.return_value.__enter__.return_value = io.BytesIO(b'{"messageId":"test"}')
        self.assertTrue(mailer.send(self.message, self.env))
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), "fake-brevo")
        self.assertIsNone(request.get_header("Authorization"))
        self.assertEqual(json.loads(request.data), {
            "sender": {"name": "Gaesland", "email": "tienda@example.invalid"},
            "to": [{"email": "alerta@example.invalid"}], "subject": "Prueba",
            "textContent": "Texto", "htmlContent": "<p>Texto</p>",
        })

    @patch.object(mailer, "urlopen")
    def test_legacy_without_brevo(self, send):
        send.return_value.__enter__.return_value = io.BytesIO(b'{"id":"test"}')
        self.assertTrue(mailer.send(self.message, {**self.env, "BREVO_API_KEY": ""}))
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.resend.com/emails")
        self.assertEqual(request.get_header("Authorization"), "Bearer fake-resend")

    @patch.object(mailer, "urlopen")
    def test_no_credentials_no_network(self, send):
        self.assertFalse(mailer.send(self.message, {}))
        send.assert_not_called()

    @patch.object(mailer, "urlopen")
    def test_failure_does_not_fallback_or_expose_response(self, send):
        send.side_effect = HTTPError("https://api.brevo.com", 401, "fake-brevo", {}, None)
        with patch("sys.stderr", new_callable=io.StringIO) as errors:
            self.assertFalse(mailer.send(self.message, self.env))
        self.assertNotIn("fake-brevo", errors.getvalue())
        self.assertEqual(send.call_count, 1)

    @patch.object(mailer, "urlopen")
    def test_no_confirmation_not_success(self, send):
        send.return_value.__enter__.return_value = io.BytesIO(b'{}')
        self.assertFalse(mailer.send(self.message, self.env))


if __name__ == "__main__":
    unittest.main()
