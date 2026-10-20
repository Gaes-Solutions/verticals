#!/usr/bin/env python3
"""Deterministic release audit runner.

The matrix is trusted repository data, not an input language. Commands are
validated against a fixed allowlist and run with a small synthetic-only env.
This script never loads dotenv, contacts providers, or runs a command from an
environment variable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
from datetime import datetime, timezone

MATRIX_REL = Path("automation/release-audit-matrix.json")
VERSION = 1
SHA40 = re.compile(r"^[0-9a-f]{40}$")
LOCAL_DB = re.compile(r"^(?:postgres(?:ql)?://)[^/@]+(?::[^/@]*)?@(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/[^?#]+$")
ALLOWED_HEADS = {"pnpm", "node", "python3"}
ALLOWED_COMMANDS = {
    "monorepo-typecheck", "api-unit", "api-isolated", "web-tienda-unit",
    "web-admin-unit", "web-pos-unit", "platform-workflows", "mobile-cliente-unit",
    "mobile-kiosko-unit", "mobile-negocio-unit", "storefront-controlled",
    "retail-e2e", "shopper-e2e", "web-builds",
    "package-unit", "other-surface-unit", "automation-safety", "node-safety", "lint-scope",
}
FIXED_COMMANDS = {
    "monorepo-typecheck": ["pnpm", "typecheck"],
    "api-unit": ["pnpm", "--filter", "@gaespos/api", "exec", "vitest", "run", "--config", "test/run-approved-incident-unit.config.ts"],
    "api-isolated": ["node", "scripts/testing/run-api-isolated.cjs"],
    "web-tienda-unit": ["pnpm", "--filter", "@gaespos/web-tienda", "test"],
    "web-admin-unit": ["pnpm", "--filter", "@gaespos/web-admin", "exec", "vitest", "run"],
    "web-pos-unit": ["pnpm", "--filter", "@gaespos/web-pos", "test"],
    "platform-workflows": ["node", "scripts/testing/run-platform-workflows.cjs"],
    "mobile-cliente-unit": ["pnpm", "--filter", "@gaespos/mobile-cliente", "test"],
    "mobile-kiosko-unit": ["pnpm", "--filter", "@gaespos/mobile-kiosko", "test"],
    "mobile-negocio-unit": ["pnpm", "--filter", "@gaespos/mobile-negocio", "test"],
    "storefront-controlled": ["node", "scripts/testing/run-storefront-browser-regressions.cjs"],
    "retail-e2e": ["node", "scripts/testing/run-platform-workflows.cjs", "--retail-e2e"],
    "shopper-e2e": ["node", "scripts/testing/run-platform-workflows.cjs", "--shopper-e2e"],
    "web-builds": ["pnpm", "--recursive", "--workspace-concurrency=1", "--filter", "@gaespos/web-tienda", "--filter", "@gaespos/web-admin", "--filter", "@gaespos/web-pos", "--filter", "@gaespos/web-superadmin", "build"],
}

# Explicit package list: db's test target is cli/utils.test.ts only (no DB setup).
PACKAGE_TESTS = ["ai", "api-client", "billing", "db", "email", "fiscal", "mensajeria", "pagos", "paqueterias", "permissions", "pricing", "recargas", "sync", "sync-client"]
FIXED_COMMANDS["package-unit"] = ["pnpm", "--recursive", "--workspace-concurrency=1", *[part for package in PACKAGE_TESTS for part in ("--filter", "@gaespos/" + package)], "test"]
FIXED_COMMANDS["other-surface-unit"] = ["pnpm", "--recursive", "--workspace-concurrency=1", "--filter", "@gaespos/web-vendedor", "--filter", "@gaespos/pos-desktop", "test"]
AUTOMATION_TESTS = [
    ("test_codex_subscription_preflight.py", None),
    ("test_incident_local_service.py", None),
    ("test_incident_local_worker.py", None),
    ("test_incident_pending_results.py", None),
    ("test_incident_worker_client.py", None),
    ("test_incident_health.py", None),
    ("test_release_audit.py", None),
    ("autonomous-front-cycle.test.py", None),
    ("autonomous-front-cycle-phase.test.py", None),
    ("autonomous-front-integration.test.py", "AutonomousIntegrationTests"),
    ("autonomous-incident-cycle-phase.test.py", None),
    ("prepare-native-artifacts.test.py", None),
    ("verify-native-smoke-proof.test.py", None),
    ("test-restore-ensayo.py", None),
    ("test-system-email.py", None),
]
# A fixed Python program handles filenames containing dots without shell expansion.
AUTOMATION_PROGRAM = """import importlib.util,sys,unittest
from pathlib import Path
suite=unittest.TestSuite()
for index,(filename,classname) in enumerate(%r):
 path=Path('scripts/testing')/filename
 spec=importlib.util.spec_from_file_location('release_safety_'+str(index),path)
 module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
 suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(getattr(module,classname)) if classname else unittest.defaultTestLoader.loadTestsFromModule(module))
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() and not result.skipped else 1)
""" % AUTOMATION_TESTS
FIXED_COMMANDS["automation-safety"] = ["python3", "-c", AUTOMATION_PROGRAM]
FIXED_COMMANDS["node-safety"] = ["node", "--test", "scripts/testing/run-api-isolated.test.cjs", "scripts/testing/publish-staging-apks.test.cjs"]
FIXED_COMMANDS["lint-scope"] = ["pnpm", "exec", "biome", "check", "apps/api/src/observability", "apps/api/src/jobs/incident-auditor-scheduler.ts", "apps/api/src/modules/admin/incidents-routes.ts", "apps/api/src/modules/internal", "apps/api/src/scripts/run-approved-incident.ts", "apps/api/test/incidents-persistence.test.ts", "apps/api/test/run-approved-incident.unit.ts", "apps/api/test/incidents.unit.ts", "apps/api/test/log-privacy.unit.ts", "apps/api/test/incidents-admin.unit.ts", "apps/api/test/incidents-response.unit.ts", "apps/api/test/incident-worker.unit.ts", "apps/web-tienda", "--max-diagnostics=50"]



def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def fail(message: str) -> None:
    raise SystemExit(message)


def synthetic_environment() -> dict[str, str]:
    db = os.environ.get("DATABASE_URL_MASTER", "")
    if not LOCAL_DB.fullmatch(db):
        fail("DATABASE_URL_MASTER must be a localhost synthetic PostgreSQL URL")
    # Explicit allowlist. In particular, no provider key, HOME config, .env,
    # shell injection flags, proxy, GitHub token or personal session is passed.
    home = Path(os.environ.get("AUDIT_HOME", "/tmp/gaes-release-audit-home"))
    if home.is_symlink() or not home.is_absolute():
        fail("AUDIT_HOME must be an absolute non-symlink path")
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(home, 0o700)
    # Reuse only the already-installed browser binaries. Never expose the
    # caller's full HOME or its Codex/npm credentials to a check.
    source_home = Path(os.environ.get("HOME", ""))
    source_cache = source_home / ".cache" / "ms-playwright"
    browser_cache = home / ".cache" / "ms-playwright"
    if source_cache.is_dir() and not source_cache.is_symlink() and not browser_cache.exists():
        browser_cache.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        browser_cache.symlink_to(source_cache, target_is_directory=True)
    env = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(home),
        "TMPDIR": os.environ.get("AUDIT_TMPDIR", "/tmp"),
        "LANG": "C.UTF-8",
        "TZ": "UTC",
        "CI": "true",
        "NODE_ENV": "test",
        "NO_COLOR": "1",
        "DATABASE_URL_MASTER": db,
        "DATABASE_URL_TENANT": db,
        "JWT_SECRET": "test-jwt-secret-must-be-at-least-32-chars-long",
        "JWT_REFRESH_SECRET": "test-refresh-secret-must-be-at-least-32-chars-long",
        "COOKIE_SECRET": "test-cookie-secret-must-be-at-least-32-chars-long",
        "PAGOS_ALLOW_MOCK": "true",
        "BILLING_SCHEDULER_ENABLED": "false",
        "FLOWS_SCHEDULER_ENABLED": "false",
        "RECORDATORIOS_SCHEDULER_ENABLED": "false",
        "INCIDENT_AUDITOR_ENABLED": "false",
        "AGENT_RUNNER_ENABLED": "false",
        "RATE_LIMIT_MAX": "100000",
        "RATE_LIMIT_WINDOW": "1 minute",
    }
    if browser_cache.exists():
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_cache)
    if os.environ.get("RELEASE_AUDIT_ISOLATED") == "true":
        if not Path("/.dockerenv").is_file():
            fail("isolated audit flag requires a Docker boundary")
        env["RELEASE_AUDIT_ISOLATED"] = "true"
    return env


def load_matrix(repo: Path, matrix_path: Path | None = None) -> tuple[dict, str]:
    path = matrix_path if matrix_path is not None else repo / MATRIX_REL
    if not path.is_absolute() or any(parent.is_symlink() for parent in (path, *path.parents)) or not path.is_file():
        fail("release audit matrix missing or symlinked")
    data = json.loads(path.read_text(encoding="utf8"))
    if data.get("version") != VERSION or not isinstance(data.get("checks"), list):
        fail("unsupported release audit matrix")
    seen = set()
    for row in data["checks"]:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row.get("id") in seen:
            fail("duplicate or invalid audit check")
        seen.add(row.get("id"))
        if row.get("id") not in ALLOWED_COMMANDS:
            fail("unknown audit check")
        command = row.get("command")
        if not isinstance(command, list) or not command or command[0] not in ALLOWED_HEADS:
            fail("invalid audit command head")
        if not isinstance(row.get("timeoutSeconds"), int) or not 1 <= row["timeoutSeconds"] <= 3600:
            fail("invalid audit timeout")
        if not all(isinstance(x, str) and x and "\x00" not in x for x in command):
            fail("invalid audit command argument")
        validate_command(row["id"], command)
    if seen != ALLOWED_COMMANDS:
        fail("release audit requires the exact complete check set")
    if data["checks"][0]["id"] != "web-builds":
        fail("serial builds must precede typecheck and shopper checks")
    if not isinstance(data.get("manualRequired"), list) or not data["manualRequired"] or not all(isinstance(item, str) and item for item in data["manualRequired"]):
        fail("manual release gates must remain explicit")
    return data, sha256(path)


def validate_command(check_id: str, command: list[str]) -> None:
    # Matrix contents are checked again at execution time; no arbitrary command
    # can be smuggled into a copied matrix or changed environment.
    if check_id not in ALLOWED_COMMANDS or command[0] not in ALLOWED_HEADS:
        fail("blocked audit command")
    if command != FIXED_COMMANDS[check_id]:
        fail("audit command does not match fixed contract")


def process_snapshot() -> dict[int, str]:
    """Process start-times prevent cleanup from targeting a reused PID."""
    result = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            result[int(entry.name)] = fields[19]
        except (OSError, IndexError):
            continue
    return result


def cleanup_new_processes(before: dict[int, str], isolated: bool) -> None:
    # Detached Vite/API children escape process groups. Only an attested,
    # dedicated QA container may clean its process namespace this broadly.
    if not isolated or not Path('/.dockerenv').is_file():
        return
    children = {pid: start for pid, start in process_snapshot().items()
                if pid != os.getpid() and before.get(pid) != start}
    for sig in (signal.SIGTERM, signal.SIGKILL):
        current = process_snapshot()
        for pid, start in children.items():
            if current.get(pid) != start:
                continue
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        if children and sig == signal.SIGTERM:
            time.sleep(0.2)


def run_process(command, repo, env, out, timeout):
    before = process_snapshot()
    process = subprocess.Popen(command, cwd=repo, env=env, stdout=out,
                               stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                               start_new_session=True)
    try:
        return process.wait(timeout=timeout)
    finally:
        # On timeout/interruption kill the complete ordinary process group first.
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=2)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
        cleanup_new_processes(before, env.get('RELEASE_AUDIT_ISOLATED') == 'true')


def run_check(repo: Path, check: dict, env: dict[str, str], log: Path) -> dict:
    check_id, command = check['id'], check['command']
    validate_command(check_id, command)
    started = time.monotonic()
    status, exit_code, reason = 'failed', None, None
    log.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    run_env = dict(env)
    if check_id == 'web-builds':
        run_env['NODE_ENV'] = 'production'
    with os.fdopen(fd, 'wb') as out:
        try:
            if check_id == 'storefront-controlled':
                exit_code = run_process(['pnpm', 'exec', 'tailwindcss', '-i', 'src/app/globals.css', '-o', '/tmp/gaes-audit-storefront.css'], repo / 'apps/web-tienda', run_env, out, min(600, check['timeoutSeconds']))
            if exit_code in (None, 0):
                exit_code = run_process(command, repo, run_env, out, check['timeoutSeconds'])
            status = 'passed' if exit_code == 0 else 'failed'
            if exit_code != 0:
                reason = 'command_exit_nonzero'
        except FileNotFoundError:
            status, reason = 'blocked', 'required_tool_missing'
        except subprocess.TimeoutExpired:
            status, reason = 'blocked', 'timeout'
        except OSError:
            status, reason = 'blocked', 'runner_os_error'
    # The retained evidence is bounded; container disk limits remain separate.
    max_log = 50 * 1024 * 1024
    if log.stat().st_size > max_log:
        with log.open('rb') as source:
            head = source.read(max_log // 2)
            source.seek(-max_log // 2, os.SEEK_END)
            tail = source.read(max_log // 2)
        with log.open('wb') as bounded:
            bounded.write(head + b'\n[release-audit log truncated]\n' + tail)
    result = {'checkId': check_id, 'status': status,
              'durationMs': round((time.monotonic() - started) * 1000),
              'exitCode': exit_code, 'logSha256': sha256(log)}
    if reason:
        result['reason'] = reason
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path("/workspace"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--matrix", type=Path)
    args = parser.parse_args()
    if not args.output.is_absolute() or args.output.is_symlink():
        fail("output must be an absolute non-symlink path")
    if any(parent.is_symlink() for parent in [args.output.parent, *args.output.parent.parents]):
        fail("output path cannot contain symlinked parents")
    repo = args.repo.resolve()
    if not repo.is_dir() or (repo / ".git").is_file() or (repo / ".git").is_symlink():
        fail("repo must be a working tree with a directory .git")
    matrix, matrix_sha = load_matrix(repo, args.matrix)
    env = synthetic_environment()
    logs = args.output.parent / "audit-logs"
    if logs.exists():
        shutil.rmtree(logs)
    logs.mkdir(parents=True, mode=0o700)
    start = now()
    try:
        base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, env=env, text=True,
                              capture_output=True, check=True, timeout=10).stdout.strip()
    except Exception:
        fail("unable to resolve repository HEAD")
    if not SHA40.fullmatch(base):
        fail("repository HEAD is not a commit SHA")
    results = [{"checkId": row["id"], "status": "notrun", "durationMs": 0, "exitCode": None, "logSha256": None, "reason": "not_executed"} for row in matrix["checks"]]
    def write_report(overall: str) -> None:
        report = {
            "version": VERSION, "baseSha": base, "controllerMatrixSha256": matrix_sha,
            "startedAt": start, "finishedAt": now(), "overall": overall,
            "results": results, "manualRequired": matrix["manualRequired"],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        tmp = args.output.with_name(args.output.name + ".tmp")
        tmp.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
        os.chmod(tmp, 0o600)
        tmp.replace(args.output)
    write_report("running")
    def interrupt(_signum, _frame):
        raise KeyboardInterrupt
    previous_term = signal.signal(signal.SIGTERM, interrupt)
    index = 0
    try:
        for index, check in enumerate(matrix["checks"]):
            # Persist notrun entries before each command; interruption cannot erase
            # the audit scope or make absent checks look successful.
            write_report("running")
            results[index] = run_check(repo, check, env, logs / f"{check['id']}.log")
            write_report("running")
    except KeyboardInterrupt:
        if results[index]["status"] == "notrun":
            results[index].update(status="blocked", reason="interrupted")
        write_report("incomplete")
        return 130
    finally:
        signal.signal(signal.SIGTERM, previous_term)
    overall = ("passed" if all(x["status"] == "passed" for x in results)
               else "incomplete" if any(x["status"] in ("blocked", "notrun") for x in results)
               else "failed")
    write_report(overall)
    return 0 if overall == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
