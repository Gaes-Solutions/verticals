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
        private_files = [name for name in archive.namelist()
                         if Path(name).name == ".env"
                         or Path(name).suffix in {".jks", ".keystore", ".p12"}]
        assert not private_files, "APK contains a private configuration or signing file"
        architectures = sorted({name.split("/")[1] for name in archive.namelist()
                                if name.startswith("lib/")})
        assert architectures == ["arm64-v8a", "armeabi-v7a"], "Unexpected phone architectures"
        bundle = archive.read("assets/index.android.bundle")
        assert b"https://verticals-staging.up.railway.app" in bundle, "Missing staging API"
        assert b"gaesland" in bundle, "Missing fixed shop"
        assert not re.search(rb"(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]{24,}", bundle), (
            "Bundle contains a private Stripe credential pattern"
        )
    print(json.dumps({
        "result": "PASS", "versionCode": args.version,
        "package": "com.gaessoft.cliente.staging", "signatureVerified": True,
        "architectures": architectures, "permissions": sorted(permissions),
        "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f"APK validation failed: {error}\n")
