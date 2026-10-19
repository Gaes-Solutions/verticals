#!/usr/bin/env bash
set -euo pipefail
results="$RUNNER_TEMP/native/results"
mkdir -p "$results"
export MAESTRO_CLI_NO_ANALYTICS=1
# Only the disposable runner launcher: a cold-start ANR covered the shop UI.
# Keep the app's own ANRs/errors visible and lower software rendering work.
adb shell am force-stop com.google.android.apps.nexuslauncher
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher > "$results/launcher.log" 2>&1 || true
adb shell wm size 1080x1920
adb install -r "$RUNNER_TEMP/native/client.apk" > "$results/install.log" 2>&1
for flow in guest account; do
  output="results.xml"
  log="maestro.log"
  if [[ "$flow" == account ]]; then output="account-results.xml"; log="account.log"; fi
  if ! maestro test --format junit --output "$results/$output" ".maestro/native-$flow.yml" > "$results/$log" 2>&1; then
    adb exec-out screencap -p > gaesland-native-failure.png || true
    adb shell uiautomator dump /sdcard/native-ui.xml >/dev/null 2>&1 || true
    adb pull /sdcard/native-ui.xml "$results/view-hierarchy.xml" >/dev/null 2>&1 || true
    adb logcat -d -s AndroidRuntime:E ReactNativeJS:E > "$results/crash.log" || true
    python3 ../../scripts/testing/sanitize-native-results.py
    cat "$results/$log"
    exit 1
  fi
  python3 ../../scripts/testing/sanitize-native-results.py
  cat "$results/$log"
done

# Kiosk smoke stops at setup: no token, activation, orders or payment requests.
adb install -r "$RUNNER_TEMP/native/kiosk.apk" > "$results/kiosko-install.log" 2>&1
# Maestro 2.11 writes screenshots into its run bundle, not the working directory.
# Keep the full bundle private; publish only the expected setup screenshot.
kiosko_private="$RUNNER_TEMP/native/kiosko-private"
mkdir "$kiosko_private"
if ! maestro test --test-output-dir "$kiosko_private" --format junit --output "$results/kiosko-results.xml" "../mobile-kiosko/.maestro/native-setup.yml" > "$results/kiosko.log" 2>&1; then
  adb exec-out screencap -p > "$results/kiosko-native-failure.png" || true
  adb shell uiautomator dump /sdcard/native-ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/native-ui.xml "$results/kiosko-view-hierarchy.xml" >/dev/null 2>&1 || true
  adb logcat -d -s AndroidRuntime:E ReactNativeJS:E > "$results/kiosko-crash.log" || true
  python3 ../../scripts/testing/sanitize-native-results.py
  cat "$results/kiosko.log"
  exit 1
fi
mapfile -d '' kiosko_screenshots < <(find "$kiosko_private" -type f -path '*/takeScreenshot/kiosko-setup.png' -print0)
if [[ ${#kiosko_screenshots[@]} -ne 1 || ! -s "${kiosko_screenshots[0]:-}" ]]; then
  echo "Expected exactly one nonempty kiosk setup screenshot in this run's private Maestro bundle." >> "$results/kiosko.log"
  python3 ../../scripts/testing/sanitize-native-results.py
  cat "$results/kiosko.log"
  exit 1
fi
cp "${kiosko_screenshots[0]}" "$results/kiosko-setup.png"
python3 ../../scripts/testing/sanitize-native-results.py
cat "$results/kiosko.log"
