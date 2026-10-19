"""Tests aislados del controlador por fases; no invoca modelos ni red."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CONTROLLER = ROOT / "scripts/autonomous-front-cycle-phase.sh"
WORKFLOW = ROOT / ".github/workflows/autonomous-front-cycle.yml"


class AutonomousPhaseTests(unittest.TestCase):
    def fixture(self):
        tmp = tempfile.TemporaryDirectory(prefix="autonomy-phase-")
        root = Path(tmp.name)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        (root / "automation").mkdir()
        (root / ".gitignore").write_text("fake-kimi\nseen-env.json\nfake-pnpm\npnpm\nartifacts/\n")
        (root / "automation/front-backlog.md").write_text("- [ ] ST-001 | tarea sintética\n")
        (root / "apps/web-tienda/src").mkdir(parents=True)
        (root / "apps/web-tienda/src/base.ts").write_text("export const base = true;\n")
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "-c", "user.name=QA", "-c", "user.email=qa@example.invalid", "commit", "-qm", "base"], cwd=root, check=True)
        return tmp, root

    def env(self, root, phase, extra=None):
        artifact = root / "artifacts"
        env = {
            **os.environ,
            "PATH": f"{root}:{os.environ['PATH']}",
            "AUTONOMY_PHASE": phase,
            "ARTIFACT_DIR": str(artifact),
            "BACKLOG_FILE": "automation/front-backlog.md",
            "KIMI_BIN": str(root / "fake-kimi"),
            "CODEX_BIN": str(root / "fake-codex"),
            "KIMI_MODEL_API_KEY": "synthetic-kimi-key",
            "KIMI_MODEL_NAME": "synthetic-model",
            "OPENAI_API_KEY": "synthetic-openai-key",
            "KIMI_TIMEOUT": "2s",
            "CODEX_TIMEOUT": "2s",
            "AUTONOMY_VALIDATE_ISOLATED": "true",
            "AUTONOMY_VALIDATE_TEST_MODE": "true",
        }
        if extra:
            env.update(extra)
        return env

    def test_executor_does_not_forward_publication_or_mail_secrets(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-kimi").write_text(
                "#!/usr/bin/env python3\n"
                "import json, os\n"
                "from pathlib import Path\n"
                "Path('seen-env.json').write_text(json.dumps(dict(os.environ)))\n"
                "Path('apps/web-tienda/src/change.ts').write_text('export const change = true;\\n')\n"
            )
            (root / "fake-kimi").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor", {
                "KIMI_MODEL_API_KEY": "kimi-sentinel", "KIMI_MODEL_NAME": "synthetic-model", "GH_TOKEN": "gh-sentinel",
                "OPENAI_API_KEY": "openai-sentinel", "RESEND_API_KEY": "mail-sentinel",
                "BREVO_API_KEY": "brevo-sentinel",
            }), capture_output=True, text=True, timeout=8)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            seen = json.loads((root / "seen-env.json").read_text())
            self.assertEqual(seen.get("KIMI_MODEL_API_KEY"), "kimi-sentinel")
            for key in ("GH_TOKEN", "OPENAI_API_KEY", "RESEND_API_KEY", "BREVO_API_KEY"):
                self.assertNotIn(key, seen)
            metadata = json.loads((root / "artifacts/metadata.json").read_text())
            self.assertEqual(metadata["patch_sha256"], hashlib.sha256((root / "artifacts/patch").read_bytes()).hexdigest())

    def test_tampered_patch_fails_before_package_commands(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-kimi").write_text("#!/bin/sh\necho changed > apps/web-tienda/src/change.ts\n")
            (root / "fake-kimi").chmod(0o700)
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
            (root / "fake-kimi").write_text("#!/bin/sh\necho changed > apps/web-tienda/src/change.ts\n")
            (root / "fake-kimi").chmod(0o700)
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
            (root / "fake-kimi").write_text(
                "#!/bin/sh\n"
                "echo forbidden > outside.ts\n"
            )
            (root / "fake-kimi").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor"), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fuera de alcance", result.stderr)
            self.assertFalse((root / "artifacts/metadata.json").exists())

    def test_executor_rejects_provider_key_in_patch(self):
        tmp, root = self.fixture()
        with tmp:
            (root / "fake-kimi").write_text(
                "#!/bin/sh\n"
                "printf '%s\\n' \"$KIMI_MODEL_API_KEY\" > apps/web-tienda/src/leak.ts\n"
            )
            (root / "fake-kimi").chmod(0o700)
            result = subprocess.run(["bash", str(CONTROLLER)], cwd=root, env=self.env(root, "executor", {
                "KIMI_MODEL_API_KEY": "sentinel-provider-key",
            }), capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("contenido sensible", result.stderr)
            self.assertFalse((root / "artifacts/metadata.json").exists())

    def test_workflow_disables_checkout_credentials_and_splits_secret_jobs(self):
        workflow = WORKFLOW.read_text()
        self.assertEqual(workflow.count("persist-credentials: false"), 5)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", workflow)
        self.assertIn("--sandbox read-only", CONTROLLER.read_text())
        self.assertIn("KIMI_API_KEY", workflow)
        self.assertIn("OPENAI_API_KEY", workflow)
        self.assertIn("GH_TOKEN", workflow)
        self.assertIn("@moonshot-ai/kimi-code@2.2.0", workflow)
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
            (root / "fake-kimi").write_text(
                "#!/bin/sh\n"
                "mkdir -p artifacts\n"
                "printf no-work > artifacts/no-work\n"
                "echo changed > apps/web-tienda/src/change.ts\n"
            )
            (root / "fake-kimi").chmod(0o700)
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
