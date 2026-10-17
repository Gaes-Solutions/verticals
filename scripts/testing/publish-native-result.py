"""Publish guest-only test evidence to an isolated branch, readable over Git SSH."""
import base64
import json
import os
from pathlib import Path
import urllib.request

repo = os.environ["GITHUB_REPOSITORY"]
sha = os.environ["GITHUB_SHA"]
run_id = os.environ["GITHUB_RUN_ID"]
attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
branch = f"qa-native/{sha[:12]}-{run_id}-{attempt}"
token = os.environ["GH_TOKEN"]


def api(path, data):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/{path}",
        data=json.dumps(data).encode(),
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                 "Content-Type": "application/json", "User-Agent": "Gaesland-Native-QA"},
        method="POST" if path == "git/refs" else "PUT",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


summary = {
    "status": os.environ["QA_NATIVE_STATUS"], "sourceCommit": sha,
    "runUrl": f"https://github.com/{repo}/actions/runs/{run_id}",
    "apkVersion": int(os.environ["QA_APK_VERSION"]), "environment": "staging", "account": "anonymous",
}
files = {"qa-native-result.json": json.dumps(summary, indent=2).encode()}
results = Path(os.environ["RUNNER_TEMP"]) / "native/results/results.xml"
if results.is_file():
    files["qa-native-artifacts/results.xml"] = results.read_bytes()[:200000]
for name in ("install.log", "maestro.log", "view-hierarchy.xml", "crash.log"):
    file = results.parent / name
    if file.is_file():
        files[f"qa-native-artifacts/{name}"] = file.read_bytes()[-200000:]
roots = [Path("apps/mobile-cliente"), Path.home() / ".maestro/tests"]
for root in roots:
    if not root.exists():
        continue
    for file in root.rglob("gaesland-*.png"):
        if len(files) >= 10:
            break
        if file.is_file() and file.stat().st_size <= 2_000_000:
            files[f"qa-native-artifacts/{file.name}"] = file.read_bytes()

api("git/refs", {"ref": f"refs/heads/{branch}", "sha": sha})
for name, content in files.items():
    api(f"contents/{name}", {
        "branch": branch, "message": "test: record bounded native staging evidence",
        "content": base64.b64encode(content).decode(),
    })
print(f"Native QA result saved on {branch}")
