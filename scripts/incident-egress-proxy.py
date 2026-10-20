#!/usr/bin/env python3
"""CONNECT-only proxy: subscription containers can reach fixed OpenAI TLS hosts."""
import ipaddress
import select
import socket
import socketserver
import threading
import time

HOSTS = frozenset(('chatgpt.com', 'auth.openai.com', 'api.openai.com'))
SLOTS = threading.BoundedSemaphore(24)


def target_address(authority):
    if authority not in {host + ':443' for host in HOSTS}:
        raise ValueError('destination denied')
    host = authority[:-4]
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    for family, kind, protocol, _, address in sorted(addresses, key=lambda row: row[0] != socket.AF_INET):
        if ipaddress.ip_address(address[0]).is_global:
            return family, kind, protocol, address
    raise ValueError('nonpublic destination')


class Proxy(socketserver.StreamRequestHandler):
    def handle(self):
        if not SLOTS.acquire(blocking=False):
            return
        upstream = None
        try:
            self.connection.settimeout(10)
            request = self.rfile.readline(4097)
            if len(request) > 4096:
                return
            parts = request.decode('ascii').strip().split(' ')
            if len(parts) != 3 or parts[0] != 'CONNECT' or parts[2] not in ('HTTP/1.0', 'HTTP/1.1'):
                return
            family, kind, protocol, address = target_address(parts[1])
            total = 0
            while True:
                line = self.rfile.readline(4097)
                total += len(line)
                if not line or total > 16384:
                    return
                if line in (b'\r\n', b'\n'):
                    break
            upstream = socket.socket(family, kind, protocol)
            upstream.settimeout(15)
            upstream.connect(address)
            self.connection.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            last = time.monotonic()
            while time.monotonic() - last < 180:
                readable, _, _ = select.select([self.connection, upstream], [], [], 10)
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    destination = upstream if source is self.connection else self.connection
                    destination.sendall(data)
                    last = time.monotonic()
        except Exception:
            pass  # Never log request headers, subscription tokens or response bodies.
        finally:
            if upstream:
                upstream.close()
            SLOTS.release()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('0.0.0.0', 3128), Proxy) as server:
        server.serve_forever()
