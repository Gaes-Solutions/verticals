#!/usr/bin/env node
// Exercise the installed Metro/image-size chain. Hostile files stay in a
// temporary directory and execute in timed children; no network/server is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const root = process.env.GAES_REPO_ROOT || path.resolve(__dirname, "../..");
const mobile = createRequire(path.join(root, "apps/mobile-cliente/package.json"));
const rn = createRequire(mobile.resolve("react-native/package.json"));
const cli = createRequire(rn.resolve("@react-native/community-cli-plugin/package.json"));
const metroPackage = cli.resolve("metro/package.json");
const metroRequire = createRequire(metroPackage);
const imageSizePath = metroRequire.resolve("image-size");
const imageSize = metroRequire("image-size");
const metroAssetsPath = path.join(path.dirname(metroPackage), "src/Assets.js");
const metroAssets = require(metroAssetsPath);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-image-size-regression-"));
function box(name, payload = Buffer.alloc(0), size = 8 + payload.length) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size);
  header.write(name, 4);
  return Buffer.concat([header, payload]);
}
function assertRejectedPromptly(source, filename) {
  const child = spawnSync(process.execPath, ["-e", source, filename], {
    encoding: "utf8",
    timeout: 1500,
    maxBuffer: 4096,
  });
  assert.equal(
    child.status,
    0,
    child.error?.message || child.stderr || "Parser accepted malformed image",
  );
}
async function main() {
  assert.equal(typeof imageSize, "function", "Metro requires a callable CJS image-size");
  const icns = Buffer.alloc(24);
  icns.write("icns");
  icns.writeUInt32BE(24, 4);
  icns.write("icp4", 8);
  icns.writeUInt32BE(8, 12);
  icns.write("icp4", 16);
  icns.writeUInt32BE(0, 20);
  const jxl = Buffer.concat([
    box("JXL ", Buffer.from([13, 10, 135, 10])),
    box("ftyp", Buffer.from("jxl ")),
    box("jxlp", Buffer.alloc(0), 0),
  ]);
  for (const [name, bytes] of [
    ["icns", icns],
    ["jxl", jxl],
  ]) {
    const file = path.join(temporary, `${name}-disguised.png`);
    fs.writeFileSync(file, bytes);
    for (const input of ["buffer", "filename"]) {
      assertRejectedPromptly(
        `
        const imageSize = require(${JSON.stringify(imageSizePath)});
        const input = ${input === "buffer" ? "require('node:fs').readFileSync(process.argv[1])" : "process.argv[1]"};
        try { imageSize(input); process.exitCode = 1; }
        catch { console.log('rejected'); }
      `,
        file,
      );
    }
    assertRejectedPromptly(
      `
      require(${JSON.stringify(metroAssetsPath)})
        .getAssetData(process.argv[1], 'assets', [], 'android', '/assets')
        .then(() => { process.exitCode = 1; })
        .catch(() => console.log('rejected'));
    `,
      file,
    );
    console.log(`PASS malformed ${name}: ${bytes.length} bytes, buffer/filename/Metro`);
  }
  const icon = path.join(root, "apps/mobile-kiosko/assets/icon.png");
  const png = fs.readFileSync(icon);
  const expected = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  for (const input of [icon, png]) {
    const result = imageSize(input);
    assert.equal(result.width, expected.width);
    assert.equal(result.height, expected.height);
  }
  const asset = await metroAssets.getAssetData(icon, "assets", [], "android", "/assets");
  assert.equal(asset.width, expected.width);
  assert.equal(asset.height, expected.height);
  const svg = imageSize(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"></svg>'),
  );
  assert.equal(svg.width, 64);
  assert.equal(svg.height, 32);
  const validIcns = Buffer.from(icns.subarray(0, 16));
  validIcns.writeUInt32BE(16, 4);
  assert.equal(imageSize(validIcns).width, 16);
  assert.equal(imageSize(validIcns).height, 16);
  const ispe = Buffer.alloc(12);
  ispe.writeUInt32BE(64, 4);
  ispe.writeUInt32BE(128, 8);
  const heif = Buffer.concat([
    box("ftyp", Buffer.from("heic")),
    box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispe)))])),
  ]);
  assert.equal(imageSize(heif).width, 64);
  assert.equal(imageSize(heif).height, 128);
  console.log("PASS genuine PNG buffer/filename/Metro, SVG, ICNS and HEIF");
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(temporary, { recursive: true, force: true }));
