import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { PROVEEDORES_V1 } from "./catalogo.js";
import { RecargaError } from "./types.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_TLD_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

function hostAllowlist(): string[] {
  const env = process.env.RECARGAS_HOST_ALLOWLIST;
  if (env?.trim()) {
    return env
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return PROVEEDORES_V1.flatMap((p) => {
    if (!p.apiUrl) return [];
    try {
      return [new URL(p.apiUrl).hostname.toLowerCase()];
    } catch {
      return [];
    }
  });
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT RFC6598
  if (a === 192 && b === 0) return true; // 192.0.0/24 IETF + 192.0.2/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking RFC2544
  if (a >= 224) return true; // multicast/reservado/broadcast (incl. 255.255.255.255)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase().split("%")[0] ?? "";
  if (v === "::1" || v === "::") return true;
  if (/^fe[89ab]/.test(v)) return true; // link-local fe80::/10
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  if (v.startsWith("::ffff:")) return isPrivateIpv4(v.slice("::ffff:".length)); // v4-mapped
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // not a parseable IP → block
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

/**
 * Validación estructural síncrona (sin DNS) para usar en Zod.
 * Exige https y rechaza hosts internos/privados evidentes.
 */
export function isSsrfSafeUrlSync(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = normalizeHost(parsed.hostname);
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (BLOCKED_TLD_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  if (isIP(host) && isBlockedIp(host)) return false;
  return hostAllowlist().includes(host);
}

/**
 * Guard runtime completo previo a `fetch`: repite la validación estructural
 * y además resuelve DNS para bloquear hostnames que apuntan a rangos privados
 * (defensa contra registros DNS controlados por el atacante y contra configs
 * maliciosas ya persistidas antes de este parche).
 */
export async function assertSsrfSafeUrl(rawUrl: string): Promise<void> {
  if (!isSsrfSafeUrlSync(rawUrl)) {
    throw new RecargaError(
      "RECARGAKI_URL_BLOCKED",
      "apiUrl del proveedor de recargas no permitido (esquema/host interno)",
    );
  }
  const host = normalizeHost(new URL(rawUrl).hostname);
  if (isIP(host)) return; // literal IP ya validado por isSsrfSafeUrlSync
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) {
    throw new RecargaError("RECARGAKI_URL_BLOCKED", "apiUrl no resuelve a ninguna dirección");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new RecargaError(
        "RECARGAKI_URL_BLOCKED",
        "apiUrl del proveedor de recargas resuelve a una dirección privada/interna",
      );
    }
  }
}
