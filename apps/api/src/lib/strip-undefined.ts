/**
 * Quita keys cuyo valor sea `undefined`. Necesario porque
 * `exactOptionalPropertyTypes: true` impide pasar `{foo: undefined}` a Prisma:
 * los schemas Zod con `.optional()` producen `undefined` para keys ausentes.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}
