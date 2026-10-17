#!/usr/bin/env bash
set -euo pipefail
results="$RUNNER_TEMP/native/results"
mkdir -p "$results"
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
