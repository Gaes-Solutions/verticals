#!/usr/bin/env python3
"""Exercise the restore safety boundary without Docker, database or real backups."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "restore-ensayo.sh"
DOCKER = r'''#!/usr/bin/env python3
import json, os, sys, time
args = sys.argv[1:]
with open(os.environ["QA_DOCKER_LOG"], "a") as f:
    f.write(json.dumps(args) + "\n")
mode = os.environ["QA_DOCKER_MODE"]
if args[0] == "rm":
    sys.exit(1 if mode == "cleanup-fails" else 0)
if args[0] == "run":
    if mode == "start-fails":
        print("PRIVATE database startup details", file=sys.stderr)
        sys.exit(9)
    print("fake-container")
    sys.exit(0)
if "pg_isready" in args:
    sys.exit(1 if mode == "not-ready" else 0)
if "pg_restore" in args:
    sys.stdin.buffer.read()
    if "--list" in args:
        if mode == "bad-catalog":
            print("PRIVATE catalog details", file=sys.stderr)
            sys.exit(2)
        if mode != "empty-catalog": print("synthetic catalog")
        sys.exit(0)
    if mode == "restore-timeout": time.sleep(15)
    if mode == "restore-fails":
        print("PRIVATE customer row and constraint failure", file=sys.stderr)
        sys.exit(23)
    sys.exit(0)
if "psql" in args:
    sql = sys.stdin.read()
    with open(os.environ["QA_SQL_LOG"], "w") as f: f.write(sql)
    if mode == "sql-fails":
        print("PRIVATE SQL error", file=sys.stderr)
        sys.exit(8)
    print("unexpected output" if mode == "bad-counts" else "1,6,2,3")
    sys.exit(0)
sys.exit(99)
'''


class RestoreSafety(unittest.TestCase):
    def run_restore(self, mode="success", expected=None):
        with tempfile.TemporaryDirectory(prefix="gaes-restore-test-") as folder:
            root = Path(folder)
            docker = root / "docker"
            docker.write_text(DOCKER)
            docker.chmod(0o700)
            dump = root / "synthetic.dump"
            dump.write_text("synthetic archive, no customer data")
            private = root / "tmp"
            private.mkdir()
            env = {
                **os.environ,
                "PATH": f"{root}:{os.environ['PATH']}",
                "TMPDIR": str(private),
                "QA_DOCKER_LOG": str(root / "commands.jsonl"),
                "QA_SQL_LOG": str(root / "query.sql"),
                "QA_DOCKER_MODE": mode,
                "RESTORE_READY_TIMEOUT_SECONDS": "1",
                "RESTORE_TIMEOUT_SECONDS": "1",
            }
            env.pop("RESTORE_EXPECTED_COUNTS", None)
            if expected is not None:
                env["RESTORE_EXPECTED_COUNTS"] = expected
            result = subprocess.run(
                ["bash", str(SCRIPT), str(dump)], env=env,
                capture_output=True, text=True, timeout=10,
            )
            commands_file = root / "commands.jsonl"
            commands = [json.loads(line) for line in commands_file.read_text().splitlines()] if commands_file.exists() else []
            sql = (root / "query.sql").read_text() if (root / "query.sql").exists() else ""
            self.assertEqual(list(private.iterdir()), [], "private logs must always be removed")
            self.assertNotIn("PRIVATE", result.stdout + result.stderr)
            if commands:
                self.assertEqual(commands[-1][0:2], ["rm", "-fv"], "container and anonymous volume must be removed")
            return result, commands, sql

    def test_success_is_offline_strict_and_does_not_claim_completeness(self):
        result, commands, sql = self.run_restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        run = next(c for c in commands if c[0] == "run")
        self.assertEqual(run[run.index("--network") + 1], "none")
        self.assertNotIn("-p", run)
        self.assertNotIn("-P", run)
        self.assertEqual(run[-1], "postgres:18-alpine")
        restore = next(c for c in commands if "--exit-on-error" in c)
        self.assertIn("--single-transaction", restore)
        psql = next(c for c in commands if "psql" in c)
        self.assertIn("ON_ERROR_STOP=1", psql)
        self.assertIn("public.tenants", sql)
        self.assertIn("public.plans", sql)
        self.assertIn("no certifica", result.stdout)

    def test_supplied_expected_counts_are_compared(self):
        result, _, _ = self.run_restore(expected="1,6,2,3")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("cuatro conteos", result.stdout)
        result, _, _ = self.run_restore(expected="1,7,2,3")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("verificadas", result.stdout)

    def test_restore_error_is_fatal_and_never_queries_partial_data(self):
        result, commands, sql = self.run_restore("restore-fails")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("verificadas", result.stdout)
        self.assertEqual(sql, "")
        self.assertFalse(any("psql" in c for c in commands))

    def test_readiness_timeout_does_not_restore(self):
        result, commands, _ = self.run_restore("not-ready")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tiempo permitido", result.stderr)
        self.assertFalse(any("pg_restore" in c for c in commands))

    def test_restore_timeout_is_fatal(self):
        result, commands, _ = self.run_restore("restore-timeout")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("psql" in c for c in commands))

    def test_catalog_sql_and_startup_failures_always_clean_up(self):
        for mode in ["start-fails", "bad-catalog", "empty-catalog", "sql-fails", "bad-counts"]:
            with self.subTest(mode=mode):
                result, _, _ = self.run_restore(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("verificadas", result.stdout)

    def test_cleanup_failure_cannot_exit_successfully(self):
        result, _, _ = self.run_restore("cleanup-fails")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("eliminación", result.stderr)

    def test_malformed_expected_counts_reject_before_docker(self):
        result, commands, _ = self.run_restore(expected="1,2; echo unexpected")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(commands, [])


if __name__ == "__main__":
    unittest.main()
