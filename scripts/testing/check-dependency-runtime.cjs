#!/usr/bin/env node
// Synthetic compatibility checks for patched runtime dependencies. No network,
// customer data, provider credentials, database or persisted product images.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const adminRequire = createRequire(path.join(root, "apps/web-admin/package.json"));
const XLSX = adminRequire("xlsx");

async function main() {
  assert.equal(XLSX.version, "0.20.3");
  const rows = [
    { Producto: "Lámpara ñ", Precio: 123.5, Cantidad: 2 },
    { Producto: "Café", Precio: 0, Cantidad: 0.125 },
  ];
  for (const bookType of ["xlsx", "biff8", "csv"]) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Prueba");
    const buffer = XLSX.write(book, { type: "buffer", bookType });
    const read = XLSX.read(buffer, { type: "buffer", raw: true });
    const actual = XLSX.utils.sheet_to_json(read.Sheets[read.SheetNames[0]]);
    assert.deepEqual(
      actual.map((row) => ({
        Producto: row.Producto,
        Precio: Number(row.Precio),
        Cantidad: Number(row.Cantidad),
      })),
      rows,
    );
    console.log(
      `PASS SheetJS ${bookType}: import/export accents, prices and fractional quantities`,
    );
  }
  for (const app of ["web-tienda", "pos-pwa"]) {
    const consumer = createRequire(path.join(root, `apps/${app}/package.json`));
    const nextRequire = createRequire(consumer.resolve("next/package.json"));
    assert.equal(nextRequire("sharp").versions.sharp, "0.35.5");
    const { getSharp, optimizeImage } = consumer("next/dist/server/image-optimizer.js");
    const sharp = getSharp(1);
    const source = await sharp({
      create: {
        width: 64,
        height: 32,
        channels: 4,
        background: { r: 25, g: 80, b: 160, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();
    for (const contentType of ["image/png", "image/jpeg", "image/webp", "image/avif"]) {
      const optimized = await optimizeImage({
        buffer: source,
        contentType,
        quality: 75,
        width: 32,
        concurrency: 1,
      });
      const metadata = await sharp(optimized).metadata();
      assert.equal(metadata.width, 32);
      assert.equal(metadata.height, 16);
      assert.equal(
        metadata.format,
        contentType === "image/avif" ? "heif" : contentType.split("/")[1],
      );
      assert.ok(optimized.length > 0);
      console.log(`PASS ${app} Next image optimizer with sharp 0.35.5: ${contentType}`);
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
