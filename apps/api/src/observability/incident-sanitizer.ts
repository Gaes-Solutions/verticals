/** Best-effort removal of credentials before incident persistence or external delivery. */
export function sanitizeIncidentText(value: string): string {
  return value
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, "$1?[redactado]")
    .replace(/(["']?(?:set-cookie|cookie)["']?\s*[:=]\s*)[^\r\n]+/gi, "$1[redactado]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, "[redactado]")
    .replace(
      /\b(?:postgres(?:ql)?|mysql|redis|https?):\/\/[^\s/@]+:[^\s/@]+@/gi,
      "[credenciales-redactadas]@",
    )
    .replace(
      /(["']?(?:authorization|cookie|set-cookie|token|access_token|refresh_token|secret|password|passwd|api[-_]?key|signature|otp)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}&]+)/gi,
      "$1[redactado]",
    )
    .replace(/\b(?:sk[-_](?:live_|test_|proj-)?|re_|xkeysib-)[A-Za-z0-9_-]{12,}\b/g, "[redactado]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redactado]");
}

/** Query strings are unnecessary for grouping and may contain recovery links or PII. */
export function sanitizeIncidentRoute(value: string): string {
  return sanitizeIncidentText(value.split(/[?#]/, 1)[0] ?? "").slice(0, 1000);
}

const SECRET_KEY = /(authorization|cookie|token|secret|password|passwd|api[-_]?key|signature|otp)/i;

export function sanitizeIncidentContext(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncado]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" ? sanitizeIncidentText(value).slice(0, 1000) : value;
  }
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeIncidentContext(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[key] = SECRET_KEY.test(key) ? "[redactado]" : sanitizeIncidentContext(item, depth + 1);
    }
    return out;
  }
  return value === undefined ? null : sanitizeIncidentText(String(value)).slice(0, 200);
}
