/** Short, bounded cache of verified host mappings; never reuse an expired mapping on failure. */
const cache = new Map<string, { slug: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
const TTL = 30_000;
export async function resolverHostTienda(
  host: string,
  resolve: () => Promise<string>,
): Promise<string> {
  const hit = cache.get(host);
  if (hit && hit.expires > Date.now()) return hit.slug;
  const existing = pending.get(host);
  if (existing) return existing;
  if (pending.size >= 200) throw new Error("Store resolution busy");
  const request = resolve()
    .then((slug) => {
      if (!/^[a-z][a-z0-9_-]{1,49}$/.test(slug)) throw new Error("Invalid tenant resolution");
      if (cache.size >= 200) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(host, { slug, expires: Date.now() + TTL });
      return slug;
    })
    .finally(() => pending.delete(host));
  pending.set(host, request);
  return request;
}
