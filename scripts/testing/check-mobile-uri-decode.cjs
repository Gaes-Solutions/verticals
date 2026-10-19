#!/usr/bin/env node
// Exercise the installed React Navigation dependency chain and its patched CJS
// decoder. Synthetic deep links only; hostile inputs execute in timed children.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const mobile = createRequire(path.join(root, "apps/mobile-cliente/package.json"));
const router = createRequire(mobile.resolve("expo-router/package.json"));
const native = createRequire(router.resolve("@react-navigation/native/package.json"));
const core = createRequire(native.resolve("@react-navigation/core/package.json"));
const query = core("query-string");
const fromQuery = createRequire(core.resolve("query-string"));
const decoderPath = fromQuery.resolve("decode-uri-component");
const decoder = fromQuery("decode-uri-component");
assert.equal(typeof decoder, "function", "query-string requires a CJS callable");
for (const [input, expected] of [
  ["", ""],
  ["simple", "simple"],
  ["caf%C3%A9", "café"],
  ["a+b", "a b"],
  ["%2B+", "+ "],
  ["%F0%9F%8E%88", "🎈"],
  ["%2Fproducto%3Fid%3Da", "/producto?id=a"],
  ["%FE%FF", "\uFFFD\uFFFD"],
  ["%", "%"],
  ["%A", "%A"],
  ["%GG", "%GG"],
  ["%C2", "\uFFFD"],
  ["a%20b", "a b"],
  ["%00", "\0"],
])
  assert.equal(decoder(input), expected);
for (const input of [null, undefined, 1, {}, []]) assert.throws(() => decoder(input), TypeError);
assert.deepEqual(
  { ...query.parse("slug=lampara&next=%2F%28app%29%2Fproducto&nombre=Mar%C3%ADa+Jos%C3%A9") },
  {
    slug: "lampara",
    next: "/(app)/producto",
    nombre: "María José",
  },
);
assert.deepEqual({ ...query.parse("slug=uno&slug=dos") }, { slug: ["uno", "dos"] });
assert.equal(query.parse("x=%GG+%20").x, "%GG  ");
const deepLink = query.parseUrl(
  "gaessoft-cliente-staging://producto?slug=lampara&nombre=Ana+L%C3%B3pez",
);
assert.equal(deepLink.url, "gaessoft-cliente-staging://producto");
assert.equal(deepLink.query.slug, "lampara");
assert.equal(deepLink.query.nombre, "Ana López");
console.log("PASS installed decoder: 14 strings, 5 invalid types and 4 query/deep-link scenarios");
for (const [name, input] of [
  ["invalid-octets", "%FE".repeat(20000)],
  ["mixed-valid-invalid", "%41%FE".repeat(10000)],
  ["truncated-utf8", "%F0%9F%92".repeat(7000)],
  ["lone-percent", "%".repeat(65000)],
]) {
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `
    const decode=require(${JSON.stringify(decoderPath)});
    const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
    const start=performance.now(); const result=decode(input);
    if(typeof result!=='string')process.exit(2);
    console.log(Math.round(performance.now()-start));
  `,
    ],
    { input: JSON.stringify(input), encoding: "utf8", timeout: 3000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(child.status, 0, `${name}: ${child.error?.message ?? child.stderr}`);
  console.log(`PASS ${name}: ${input.length} characters, ${child.stdout.trim()}ms`);
}
