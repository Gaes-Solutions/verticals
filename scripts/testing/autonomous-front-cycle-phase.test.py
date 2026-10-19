"""Tests aislados del controlador por fases; no invoca modelos ni red."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
CONTROLLER = ROOT / "scripts/autonomous-front-cycle-phase.sh"
WORKFLOW = ROOT / ".github/workflows/autonomous-front-cycle.yml"


class AutonomousPhaseTests(unittest.TestCase):
    def fixture(self):
        tmp = tempfile.TemporaryDirectory(prefix="autonomy-phase-")
        root = Path(tmp.name)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        (root / "automation").mkdir()
        (root / ".gitignore").write_text("fake-codex\nseen-env.json\nfake-pnpm\npnpm\nartifacts/\n")
        (root / "automation/front-backlog.md").write_text("- [ ] ST-001 | tarea sintética\n")
        (root / "apps/web-tienda/src").mkdir(parents=True)
        (root / "apps/web-tienda/src/base.ts").write_text("export const base = true;\n")
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "-c", "user.name=QA", "-c", "user.email=qa@example.invalid", "commit", "-qm", "base"], cwd=root, check=True)
        return tmp, root

    def env(self, root, phase, extra=None):
        artifact = root / "artifacts"
        auth = root.parent / (root.name + "-auth")
        auth.mkdir(mode=0o700, exist_ok=True)
        (auth / "auth.json").write_text(json.dumps({"OPENAI_API_KEY": "synthetic-openai-key"}))
        (auth / "auth.json").chmod(0o600)
        self.addCleanup(shutil.rmtree, auth, ignore_errors=True)
        env = {
            **os.environ,
            "PATH": f"{root}:{os.environ['PATH']}",
            "RUNNER_TEMP": str(root.parent),
            "AUTONOMY_PHASE": phase,
            "ARTIFACT_DIR": str(artifact),
            "BACKLOG_FILE": "automation/front-backlog.md",
            "CODEX_BIN": str(root / "fake-codex"),
            "CODEX_AUTH_READY": "true",
            "CODEX_HOME": str(root.parent / (root.name + "-auth")),
            "EXECUTOR_TIMEOUT": "2s",
            "JUDGE_TIMEOUT": "2s",
            "AUTONOMY_VALIDATE_ISOLATED": "true",
            "AUTONOMY_VALIDATE_TEST_MODE": "true",
        }
        if extra:
            env.update(extra)
        return env

    def test_executor_does_not_forward_publication_or_mail_secrets(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "from pathlib import Path\n"
                "import sys\n"
                "assert sys.argv[1:6] == ['-a', 'never', 'exec', '--sandbox', 'workspace-write'], sys.argv\n"
                "assert '--ephemeral' in sys.argv\n"
                "Path('seen-env.json').write_text(json.dumps(dict(os.environ)))\n"
                "Path('apps/web-tienda/src/change.ts').write_text('export const change = true;\\n')\n"
            )
            (root / "fake-codex").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor", {
                "KIMI_MODEL_API_KEY": "kimi-sentinel", "KIMI_MODEL_NAME": "synthetic-model", "KIMI_API_KEY": "legacy-sentinel", "GH_TOKEN": "gh-sentinel", "GITHUB_TOKEN": "github-sentinel",
                "OPENAI_API_KEY": "openai-sentinel", "RESEND_API_KEY": "mail-sentinel",
                "BREVO_API_KEY": "brevo-sentinel",
            }), capture_output=True, text=True, timeout=8)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            seen = json.loads((root / "seen-env.json").read_text())
            self.assertEqual(seen.get("CODEX_HOME"), str(root.parent / (root.name + "-auth")))
            self.assertEqual(seen.get("HOME"), seen["CODEX_HOME"])
            for key in ("GH_TOKEN", "GITHUB_TOKEN", "OPENAI_API_KEY", "KIMI_MODEL_API_KEY", "KIMI_MODEL_NAME", "KIMI_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY"):
                self.assertNotIn(key, seen)
            metadata = json.loads((root / "artifacts/metadata.json").read_text())
            self.assertEqual(metadata["patch_sha256"], hashlib.sha256((root / "artifacts/patch").read_bytes()).hexdigest())

    def test_both_agents_require_isolated_auth_even_with_raw_api_key(self):
        for phase in ("executor", "judge"):
            for ready in ("false", "true"):
                with self.subTest(phase=phase, ready=ready):
                    tmp, root = self.fixture()
                    with tmp:
                        (root / "fake-codex").write_text("#!/bin/sh\necho must-not-run >&2\nexit 91\n")
                        (root / "fake-codex").chmod(0o700)
                        env = self.env(root, phase, {"CODEX_AUTH_READY": ready, "OPENAI_API_KEY": "raw-env-must-not-authorize"})
                        shutil.rmtree(env["CODEX_HOME"])
                        result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=env, capture_output=True, text=True)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertNotIn("must-not-run", result.stderr)
                        self.assertRegex(result.stderr, r"(?i)auth|autenticación|CODEX_HOME|CODEX_AUTH_READY")
                        self.assertFalse((root / "artifacts/metadata.json").exists())

    def test_personal_home_auth_is_not_used_implicitly(self):
        tmp, root = self.fixture()
        with tmp:
            env = self.env(root, "executor")
            env.pop("CODEX_HOME")
            (root / "fake-codex").write_text("#!/bin/sh\necho must-not-run >&2\nexit 91\n")
            (root / "fake-codex").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("must-not-run", result.stderr)

    def test_executor_rejects_auth_inside_repository_or_world_readable(self):
        for mode in ("inside-repository", "world-readable"):
            with self.subTest(mode=mode):
                tmp, root = self.fixture()
                with tmp:
                    env = self.env(root, "executor")
                    if mode == "inside-repository":
                        auth = root / "private-auth"
                        auth.mkdir(mode=0o700)
                        (auth / "auth.json").write_text(json.dumps({"OPENAI_API_KEY": "synthetic-openai-key"}))
                        (auth / "auth.json").chmod(0o600)
                        env["CODEX_HOME"] = str(auth)
                    else:
                        (Path(env["CODEX_HOME"]) / "auth.json").chmod(0o644)
                    (root / "fake-codex").write_text("#!/bin/sh\necho must-not-run >&2\nexit 91\n")
                    (root / "fake-codex").chmod(0o700)
                    result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=env, capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertNotIn("must-not-run", result.stderr)

    def test_waiting_review_is_clean_no_op_without_auth_or_agent(self):
        tmp, root = self.fixture()
        with tmp:
            artifact = root / "artifacts"
            artifact.mkdir()
            (artifact / "waiting-review").write_text("waiting-review")
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root,
                                    env=self.env(root, "executor", {"AUTONOMY_PREFLIGHT_WAITING": "true", "CODEX_AUTH_READY": "false", "CODEX_HOME": ""}),
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse((artifact / "patch").exists())

    def test_fixture_overrides_inherited_runner_temp_without_weakening_auth_scope(self):
        tmp, root = self.fixture()
        with tmp, patch.dict(os.environ, {"RUNNER_TEMP": "/tmp/inherited-do-not-use"}):
            (root / "fake-codex").write_text("#!/bin/sh\necho changed > apps/web-tienda/src/change.ts\n")
            (root / "fake-codex").chmod(0o700)
            env = self.env(root, "executor")
            self.assertEqual(env["RUNNER_TEMP"], str(root.parent))
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / "artifacts/metadata.json").exists())

    def test_real_workflow_preflight_shell_blocks_empty_duplicate_and_failed_queries(self):
        workflow = WORKFLOW.read_text()
        executor = workflow.split("  validate:", 1)[0]
        preflight = executor.split("      - name: Comprobar tarea pendiente antes de preparar agentes\n", 1)[1]
        body = preflight.split("        run: |\n", 1)[1].split("      - name:", 1)[0]
        lines = body.splitlines()
        self.assertTrue(lines)
        self.assertTrue(all(not line or line.startswith("          ") for line in lines))
        shell = "\n".join(line[10:] if line else "" for line in lines) + "\n"
        guard = "if: steps.preflight.outputs.has_work == 'true'"
        self.assertEqual(executor.count(guard), 3)
        for step in ("Instalar Codex CLI fijado", "Preparar autenticación aislada del ejecutor", "Ejecutar tarea sin credenciales de publicación"):
            section = executor.split("      - name: " + step + "\n", 1)[1].split("      - name:", 1)[0]
            self.assertIn(guard, section)
        cleanup = executor.split("      - name: Eliminar autenticación del ejecutor\n", 1)[1].split("      - name:", 1)[0]
        self.assertIn("if: always()", cleanup)
        self.assertIn('rm -rf -- "$RUNNER_TEMP/codex-executor-home"', cleanup)
        cases = (("pending-work", True, "", 0, "true"),
                 ("empty-backlog", False, "", 0, "false"),
                 ("pending-pr", True, "automation/front-cycle-existing", 0, "false"),
                 ("gh-failure", True, "", 41, None))
        for name, pending, prs, status, expected in cases:
            with self.subTest(case=name):
                tmp, root = self.fixture()
                with tmp:
                    if not pending:
                        (root / "automation/front-backlog.md").write_text("- [x] ST-001 | complete\n")
                    tools = root / "fake-tools"
                    tools.mkdir()
                    gh = tools / "gh"
                    gh.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$PREFLIGHT_CALLS\"\nprintf '%s' \"$PREFLIGHT_PRS\"\nexit \"$PREFLIGHT_STATUS\"\n")
                    gh.chmod(0o700)
                    runner = root / "runner-temp"
                    runner.mkdir()
                    output = root / "github-output"
                    calls = root / "preflight-calls"
                    env = {**os.environ, "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                           "RUNNER_TEMP": str(runner), "GITHUB_OUTPUT": str(output),
                           "PREFLIGHT_CALLS": str(calls), "PREFLIGHT_PRS": prs, "PREFLIGHT_STATUS": str(status)}
                    result = subprocess.run(["bash", "-euo", "pipefail", "-c", shell], cwd=root, env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, status, result.stdout + result.stderr)
                    self.assertEqual(len(calls.read_text().splitlines()), 1)
                    self.assertTrue(calls.read_text().startswith("pr list --state open --base main --json headRefName --jq "))
                    if expected is None:
                        self.assertFalse(output.exists())
                    else:
                        self.assertEqual(output.read_text(), "has_work=" + expected + "\n")
                    artifact = runner / "gaes-autonomy-artifact"
                    self.assertEqual((artifact / "waiting-review").exists(), name == "pending-pr")
                    self.assertEqual((artifact / "no-work").exists(), name == "empty-backlog")
                    self.assertFalse((artifact / "patch").exists())

    def test_tampered_patch_fails_before_package_commands(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text("#!/bin/sh\necho changed > apps/web-tienda/src/change.ts\n")
            (root / "fake-codex").chmod(0o700)
            self.assertEqual(subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True).returncode, 0)
            (root / "artifacts/patch").write_bytes((root / "artifacts/patch").read_bytes() + b"tampered")
            (root / "fake-pnpm").write_text("#!/bin/sh\necho package-command-must-not-run >&2; exit 99\n")
            (root / "fake-pnpm").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "validate", {"PATH": f"{root}:{os.environ['PATH']}"}), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("hash de patch no coincide", result.stderr)
            self.assertNotIn("package-command-must-not-run", result.stderr)

    def test_package_check_cannot_mutate_approved_artifact(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text("#!/bin/sh\necho changed > apps/web-tienda/src/change.ts\n")
            (root / "fake-codex").chmod(0o700)
            self.assertEqual(subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True).returncode, 0)
            subprocess.run(["git", "reset", "-q", "--hard", "HEAD"], cwd=root, check=True)
            (root / "pnpm").write_text("#!/bin/sh\nprintf tampered >> \"$ARTIFACT_DIR/patch\"\n")
            (root / "pnpm").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "validate"), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("artefacto aprobado", result.stderr)

    def test_executor_out_of_scope_change_fails_closed_before_artifact(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text(
                "#!/bin/sh\n"
                "echo forbidden > outside.ts\n"
            )
            (root / "fake-codex").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fuera de alcance", result.stderr)
            self.assertFalse((root / "artifacts/metadata.json").exists())

    def test_executor_rejects_provider_key_in_patch(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "from pathlib import Path\n"
                "key=json.loads((Path(os.environ['CODEX_HOME'])/'auth.json').read_text())['OPENAI_API_KEY']\n"
                "Path('apps/web-tienda/src/leak.ts').write_text(key)\n"
            )
            (root / "fake-codex").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor", {
            }), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("contenido sensible", result.stderr)
            self.assertFalse((root / "artifacts/metadata.json").exists())

    def test_workflow_disables_checkout_credentials_and_splits_secret_jobs(self):
        workflow = WORKFLOW.read_text()
        self.assertEqual(workflow.count("persist-credentials: false"), 5)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", workflow)
        self.assertIn('run_codex_role read-only "$JUDGE_TIMEOUT"', CONTROLLER.read_text())
        self.assertNotIn("KIMI_API_KEY", workflow)
        self.assertIn("OPENAI_API_KEY", workflow)
        self.assertIn("GH_TOKEN", workflow)
        self.assertNotIn("@moonshot-ai/", workflow)
        self.assertNotIn("KIMI_", workflow)
        self.assertIn('run_codex_role workspace-write "$EXECUTOR_TIMEOUT"', CONTROLLER.read_text())
        self.assertIn('"$CODEX_BIN" -a never exec', CONTROLLER.read_text())
        self.assertIn("@openai/codex@${CODEX_VERSION}", workflow)
        # El job executor no debe declarar tokens de publicación/correo.
        executor = workflow.split("  validate:", 1)[0]
        execute = executor.split("      - name: Ejecutar tarea", 1)[1].split("      - name: Detectar", 1)[0]
        self.assertNotIn("GH_TOKEN:", execute)
        self.assertNotIn("RESEND_API_KEY:", executor)
        self.assertNotIn("BREVO_API_KEY:", executor)

    def test_fingerprint_detects_assume_unchanged_worktree_tamper(self):
        tmp, root = self.fixture()
        with tmp:
            source = CONTROLLER.read_text()
            function = source[source.index("state_fingerprint() {"):source.index("\nverify_artifact()", source.index("state_fingerprint() {"))]
            before = subprocess.check_output(["bash", "-c", function + "\nstate_fingerprint"], cwd=root, text=True).strip()
            tracked = root / "apps/web-tienda/src/base.ts"
            subprocess.run(["git", "update-index", "--assume-unchanged", str(tracked)], cwd=root, check=True)
            tracked.write_text("export const base = false;\n")
            after = subprocess.check_output(["bash", "-c", function + "\nstate_fingerprint"], cwd=root, text=True).strip()
            self.assertNotEqual(before, after)

    def test_empty_backlog_is_clean_no_work(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "automation/front-backlog.md").write_text("- [x] ST-001 | ya hecho\n")
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual((root / "artifacts/no-work").read_text().strip(), "no-work")

    def test_agent_cannot_inject_no_work_while_backlog_is_pending(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-codex").write_text(
                "#!/bin/sh\n"
                "mkdir -p artifacts\n"
                "printf no-work > artifacts/no-work\n"
                "echo changed > apps/web-tienda/src/change.ts\n"
            )
            (root / "fake-codex").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse((root / "artifacts/no-work").exists())
            self.assertTrue((root / "artifacts/metadata.json").exists())

    def test_validation_is_real_docker_gated(self):
        source = CONTROLLER.read_text()
        workflow = WORKFLOW.read_text()
        self.assertIn("--network none", source)
        self.assertIn("--cap-drop ALL", source)
        self.assertIn("--security-opt no-new-privileges", source)
        self.assertIn("node:24-bookworm-slim@sha256:", source)
        self.assertIn("*/bin/pnpm.cjs", source)
        self.assertIn("*/corepack/dist/pnpm.js", source)
        self.assertIn('AUTONOMY_VALIDATE_ISOLATED: "true"', workflow)
        self.assertNotIn("AUTONOMY_VALIDATE_TEST_MODE", workflow)
        self.assertIn('reject_secret_leak "$out"', source)
        self.assertNotIn('CODEX_AUTH_READY="${CODEX_AUTH_READY:-}" OPENAI_API_KEY=', source)
        self.assertIn("has_work: ${{ steps.detect_work.outputs.has_work }}", workflow)
        self.assertIn("needs.executor.outputs.has_work == 'true'", workflow)
        self.assertIn("needs: [executor, validate]", workflow)
        self.assertIn("needs: [executor, judge]", workflow)


if __name__ == "__main__":
    unittest.main()
