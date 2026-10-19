"""Inspect the signed Gaesland staging phone APK. Requires Android SDK build-tools."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("apk", type=Path)
parser.add_argument("--version", required=True, help="Expected Android versionCode")
parser.add_argument("--previous", type=Path, help="Verify upgrade signing identity against an older APK")
parser.add_argument("--universal", action="store_true", help="Expect phone and emulator native libraries")
parser.add_argument("--sdk", type=Path, default=Path(
    os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    or str(Path.home() / "Android/Sdk")
))
args = parser.parse_args()


def main():
    tools = sorted(
        (p for p in (args.sdk / "build-tools").iterdir()
         if (p / "aapt").is_file() and (p / "apksigner").is_file()),
        key=lambda p: tuple(int(n) for n in re.findall(r"\d+", p.name)),
    )[-1]
    subprocess.run([str(tools / "apksigner"), "verify", str(args.apk)], check=True)
    if args.previous:
        def certificate(path):
            info = subprocess.check_output(
                [str(tools / "apksigner"), "verify", "--print-certs", str(path)], text=True
            )
            digest = re.search(r"Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]+)", info)
            assert digest, "Signing certificate digest is missing"
            return digest.group(1).lower()
        assert certificate(args.apk) == certificate(args.previous), "Upgrade signing identity differs"
    badging = subprocess.check_output(
        [str(tools / "aapt"), "dump", "badging", str(args.apk)], text=True
    )
    assert "name='com.gaessoft.cliente.staging'" in badging, "Not the staging customer app"
    assert f"versionCode='{args.version}'" in badging, "Unexpected APK version"
    assert "application-debuggable" not in badging, "Release APK must not be debuggable"
    permissions = set(re.findall(
        r"uses-permission: name='([^']+)'",
        subprocess.check_output(
            [str(tools / "aapt"), "dump", "permissions", str(args.apk)], text=True
        ),
    ))
    blocked = {
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
    }
    assert not permissions & blocked, f"Unnecessary permissions: {sorted(permissions & blocked)}"
    assert {
        "android.permission.INTERNET", "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.USE_BIOMETRIC", "android.permission.VIBRATE",
    } <= permissions, "Required shop capabilities are missing"
    with zipfile.ZipFile(args.apk) as archive:
        # Android resource shrinking can rename Ionicons.ttf to e.g. res/D1.ttf.
        # Compare bytes with the approved font instead of its filename.
        # @expo/vector-icons 14.1.0 Ionicons.ttf; checker also runs in CI without node_modules.
        expected_font = bytes.fromhex("9c7fb9071a6c28582c6b84468cbff2c7a71e02b17e3a3b4548a159938d22916b")
        assert any(hashlib.sha256(archive.read(name)).digest() == expected_font
                   for name in archive.namelist() if name.lower().endswith(".ttf")), (
            "Icon font asset is missing or differs from the approved dependency"
        )
        assert any(b"Lexpo/modules/font/FontLoaderModule;" in archive.read(name)
                   for name in archive.namelist()
                   if re.fullmatch(r"classes\d*\.dex", name)), (
            "Native ExpoFontLoader is missing; a JS font asset alone is not enough"
        )
        private_files = [name for name in archive.namelist()
                         if Path(name).name.startswith(".env")
                         or Path(name).suffix in {".jks", ".keystore", ".p12"}]
        assert not private_files, "APK contains a private configuration or signing file"
        architectures = sorted({name.split("/")[1] for name in archive.namelist()
                                if name.startswith("lib/")})
        expected_architectures = ["arm64-v8a", "armeabi-v7a"]
        if args.universal:
            expected_architectures += ["x86", "x86_64"]
        assert architectures == expected_architectures, "Unexpected Android architectures"
        for architecture in expected_architectures:
            for library in ("libreactnative.so", "libhermes.so"):
                assert f"lib/{architecture}/{library}" in archive.namelist(), (
                    f"Missing {library} for {architecture}"
                )
        bundle = archive.read("assets/index.android.bundle")
        assert b"https://verticals-staging.up.railway.app" in bundle, "Missing staging API"
        assert b"gaesland" in bundle, "Missing fixed shop"
        assert not re.search(rb"(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]{24,}", bundle), (
            "Bundle contains a private Stripe credential pattern"
        )
    print(json.dumps({
        "result": "PASS", "versionCode": args.version,
        "package": "com.gaessoft.cliente.staging", "signatureVerified": True,
        "upgradeCertificateVerified": bool(args.previous),
        "architectures": architectures, "permissions": sorted(permissions),
        "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f"APK validation failed: {error}\n")
