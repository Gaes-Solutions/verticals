/** Read-only comparison of the web BFF and the API used by the native shop. */
const assert = require("node:assert/strict");
const web = "https://web-tienda-staging.up.railway.app";
const mobile = "https://verticals-staging.up.railway.app/public/tiendas/gaesland";
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${new URL(url).pathname}: unexpected status`);
  return response.json();
}
function comparable(item) {
  const fields = Object.fromEntries(
    [
      "id",
      "slugSeo",
      "tituloPublico",
      "fotosArray",
      "categoriaPublica",
      "precioDesde",
      "precioPromocion",
      "enOferta",
      "descuentoPct",
      "stockPublico",
    ].map((field) => [field, item[field]]),
  );
  // El catálogo web anida variantes; el endpoint móvil las entrega planas.
  const variants = item.variantes ?? item.producto?.variantes;
  assert(Array.isArray(variants) && variants.length > 0, "Product is missing purchasable variants");
  return {
    ...fields,
    variantes: variants
      .map((variant) => ({ id: variant.id, precioBase: Number(variant.precioBase) }))
      .sort((x, y) => x.id.localeCompare(y.id)),
  };
}
(async () => {
  let count = 0;
  const images = new Set();
  for (let page = 1; ; page++) {
    assert(page <= 20, "Unexpected demo catalog size");
    const query = `page=${page}&pageSize=24`;
    const [a, b] = await Promise.all([
      read(`${web}/api/catalogo?${query}`),
      read(`${mobile}/catalogo?${query}`),
    ]);
    assert.equal(a.total, b.total, "Web and mobile expose different product counts");
    assert(a.total > 0, "Demo catalog must not be empty");
    const normalize = (items) => items.map(comparable).sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual(normalize(a.items), normalize(b.items), `Catalog differs on page ${page}`);
    for (const product of a.items) {
      assert(product.fotosArray.length > 0, `${product.slugSeo}: missing demo image`);
      for (const image of product.fotosArray) images.add(new URL(image, web).href);
    }
    count += a.items.length;
    if (count >= a.total) break;
    assert(a.items.length > 0, "Pagination ended before the advertised total");
  }
  console.log(
    `PASS ${count} products match: visibility, variants, prices, offers, stock and images`,
  );
  for (const url of images) {
    assert.equal(new URL(url).protocol, "https:");
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, "Catalog image unavailable");
    assert(
      response.headers.get("content-type")?.startsWith("image/"),
      "Catalog image is not an image",
    );
  }
  console.log(`PASS ${images.size} distinct catalog images respond with image content`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
