#!/usr/bin/env node
// Inspect the actual signed APK, not just Expo configuration or JS bundles.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const apk = process.argv[2];
assert(apk && fs.existsSync(apk), "Usage: node scripts/testing/check-kiosko-apk.cjs <signed.apk>");
function androidTool(name) {
  if (process.env.ANDROID_BUILD_TOOLS) return path.join(process.env.ANDROID_BUILD_TOOLS, name);
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  if (sdk) {
    const tools = path.join(sdk, "build-tools");
    const versions = fs
      .readdirSync(tools)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const version = versions.find((item) => fs.existsSync(path.join(tools, item, name)));
    if (version) return path.join(tools, version, name);
  }
  return name;
}
const aapt = androidTool("aapt");
const permissionsText = execFileSync(aapt, ["dump", "permissions", apk], { encoding: "utf8" });
const badging = execFileSync(aapt, ["dump", "badging", apk], { encoding: "utf8" });
const permissions = [...permissionsText.matchAll(/uses-permission[^:]*: name='([^']+)'/g)].map(
  (match) => match[1],
);
const required = ["CAMERA", "VIBRATE", "MODIFY_AUDIO_SETTINGS", "INTERNET"];
const forbidden = [
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "SYSTEM_ALERT_WINDOW",
  "RECORD_AUDIO",
];
const missing = required.filter((item) => !permissions.includes(`android.permission.${item}`));
const excessive = forbidden.filter((item) => permissions.includes(`android.permission.${item}`));
const packageName = /^package: name='([^']+)'/m.exec(badging)?.[1];
const versionCode = /versionCode='([^']+)'/.exec(badging)?.[1];
assert(
  ["com.gaessoft.kiosko", "com.gaessoft.kiosko.staging"].includes(packageName),
  "Unexpected kiosk package",
);
assert(!badging.includes("application-debuggable"), "Release kiosk must not be debuggable");
execFileSync(androidTool("apksigner"), ["verify", "--verbose", apk], { encoding: "utf8" });
console.log(
  JSON.stringify(
    { packageName, versionCode, signed: true, debuggable: false, missing, excessive, permissions },
    null,
    2,
  ),
);
assert.deepEqual(missing, [], "Required camera/beep/vibration/network permissions are missing");
assert.deepEqual(
  excessive,
  [],
  "APK still includes unnecessary storage/overlay/microphone permissions; rebuild from corrected config",
);
