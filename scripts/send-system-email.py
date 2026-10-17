#!/usr/bin/env python3
"""Send automation mail from JSON on stdin; secrets are read only from env."""
import json
import os
import sys
from email.utils import parseaddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def send(message, env):
    brevo = env.get("BREVO_API_KEY", "").strip()
    resend = env.get("RESEND_API_KEY", "").strip()
    if not brevo and not resend:
        print("Correo no configurado: no se envió el aviso", file=sys.stderr)
        return False
    sender = env.get("EMAIL_REMITENTE", "no-reply@gaessoft.com")
    recipient = env["INCIDENT_ALERT_EMAIL"]
    if brevo:
        name, email = parseaddr(sender)
        payload = {
            "sender": {"email": email, **({"name": name} if name else {})},
            "to": [{"email": recipient}],
            "subject": message["subject"],
            "textContent": message["text"],
            **({"htmlContent": message["html"]} if message.get("html") else {}),
        }
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {"api-key": brevo}
        confirmation = "messageId"
    else:
        payload = {
            "from": sender, "to": [recipient], "subject": message["subject"],
            "text": message["text"],
            **({"html": message["html"]} if message.get("html") else {}),
        }
        url = "https://api.resend.com/emails"
        headers = {"Authorization": f"Bearer {resend}"}
        confirmation = "id"
    request = Request(url, data=json.dumps(payload).encode(), method="POST",
                      headers={**headers, "Content-Type": "application/json", "Accept": "application/json"})
    # No automatic retries/failover: an ambiguous response could duplicate mail.
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
        if not isinstance(result, dict) or not result.get(confirmation):
            raise ValueError("missing confirmation")
    except HTTPError as error:
        print(f"El proveedor rechazó el correo (HTTP {error.code})", file=sys.stderr)
        return False
    except (URLError, TimeoutError, ValueError, OSError):
        print("No se pudo confirmar el envío del correo", file=sys.stderr)
        return False
    return True


if __name__ == "__main__":
    try:
        ok = send(json.load(sys.stdin), os.environ)
    except (ValueError, KeyError, TypeError):
        print("Configuración o mensaje de correo incompleto", file=sys.stderr)
        ok = False
    sys.exit(0 if ok else 1)
