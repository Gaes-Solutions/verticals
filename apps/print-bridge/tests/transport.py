"""Integration test: real bridge process, TCP printer simulator, durable retry."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
import uuid

BINARY = Path(__file__).resolve().parents[1] / "target/release/gaespos-print-bridge"
class BridgeTest(unittest.TestCase):
    def test_tcp_delivery_and_restart(self):
        received = []
        server = socket.socket()
        server.bind(("127.0.0.1", 0))
        server.listen()
        server.settimeout(0.2)
        stop = threading.Event()
        def accept():
            while not stop.is_set():
                try:
                    conn, _ = server.accept()
                except socket.timeout:
                    continue
                with conn:
                    data = b""
                    while True:
                        part = conn.recv(65536)
                        if not part:
                            break
                        data += part
                    received.append(data)
        thread = threading.Thread(target=accept)
        thread.start()
        token = secrets.token_urlsafe(32)
        proc = None
        try:
            with tempfile.TemporaryDirectory() as jobs:
                env = {**os.environ, "GAES_PRINT_TOKEN": token, "GAES_PRINT_ORIGIN": "https://pos.example.test", "GAES_PRINT_TCP": f"127.0.0.1:{server.getsockname()[1]}", "GAES_PRINT_JOBS": jobs}
                def start():
                    p = subprocess.Popen([str(BINARY)], env=env, stderr=subprocess.DEVNULL)
                    for _ in range(100):
                        try:
                            with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:9876/status", headers={"Authorization": f"Bearer {token}"}), timeout=0.2) as response:
                                if response.status == 200:
                                    return p
                        except (OSError, urllib.error.URLError):
                            time.sleep(0.05)
                    p.terminate()
                    raise AssertionError("Bridge did not start")
                proc = start()
                ticket = {"tipo": "venta", "generadoAt": "2026-09-15", "emisor": {"razonSocial": "Tienda", "sucursal": {"codigo": "A", "nombre": "Sucursal"}, "caja": {"codigo": "Caja 1"}}, "venta": {"estado": "cancelada", "folio": "V1", "fecha": "2026-09-15", "cajero": "Ana", "moneda": "MXN"}, "lineas": [{"numero": 1, "sku": "A", "descripcion": "Café\u001bp\u0000", "cantidad": "1", "precioUnitario": "100", "subtotal": "100"}], "pagos": [{"metodo": "efectivo", "monto": "100"}], "totales": {"subtotal": "100", "descuentoTotal": "0", "ivaTotal": "0", "iepsTotal": "0", "total": "100", "totalCobrado": "100", "cambioDado": "0"}}
                key = str(uuid.uuid4())
                def request(auth_token=token):
                    req = urllib.request.Request("http://127.0.0.1:9876/print/ticket", data=json.dumps(ticket).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "Idempotency-Key": key})
                    try:
                        with urllib.request.urlopen(req, timeout=15) as res:
                            return res.status, json.load(res)
                    except urllib.error.HTTPError as error:
                        return error.code, json.load(error)
                self.assertEqual(request("invalid")[0], 401)
                self.assertEqual(request()[1]["state"], "accepted")
                self.assertEqual(request()[1]["state"], "accepted")
                proc.terminate(); proc.wait(timeout=5); proc = start()
                self.assertEqual(request()[1]["state"], "accepted")
                time.sleep(0.1)
                self.assertEqual(len(received), 1)
                self.assertTrue(received[0].startswith(b"\x1b@"))
                self.assertIn(b"NO COMPROBANTE DE PAGO", received[0])
                self.assertNotIn(b"\x1bp", received[0])
                ticket["totales"]["total"] = "999"
                self.assertEqual(request()[0], 409)
                self.assertEqual(len(received), 1)
        finally:
            if proc:
                proc.terminate(); proc.wait(timeout=5)
            stop.set(); thread.join(timeout=2); server.close()
if __name__ == "__main__":
    unittest.main()
