"""The retired controller never invokes tools or mutates a task, even with old opt-in."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "autonomous-front-cycle.sh"


class RetiredAutonomousCycleTests(unittest.TestCase):
    def test_legacy_controller_is_permanently_closed_without_side_effects(self):
        for opt_in in (None, "false", "true", "1"):
            with self.subTest(opt_in=opt_in), tempfile.TemporaryDirectory(prefix="retired-autonomy-") as directory:
                root = Path(directory)
                (root / "automation").mkdir()
                backlog = root / "automation/front-backlog.md"
                backlog.write_text("- [ ] ST-001 | synthetic task\n")
                tool = root / "tool"
                tool.write_text("#!/bin/sh\nprintf called >> calls\nexit 91\n")
                tool.chmod(0o700)
                for name in ("git", "gh", "codex", "kimi", "pnpm", "python3", "curl", "timeout"):
                    (root / name).symlink_to(tool)
                env = {**os.environ, "PATH": str(root), "AUTO_MERGE": "true", "GH_TOKEN": "synthetic-gh", "BREVO_API_KEY": "synthetic-mail"}
                env.pop("AUTONOMY_LEGACY_CONTROLLER", None)
                if opt_in is not None:
                    env["AUTONOMY_LEGACY_CONTROLLER"] = opt_in
                result = subprocess.run(["/bin/bash", str(SOURCE)], cwd=root, env=env, capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 2)
                self.assertIn("retirado permanentemente", result.stderr)
                self.assertIn("scripts/autonomous-front-cycle-phase.sh", result.stderr)
                self.assertFalse((root / "calls").exists())
                self.assertEqual(backlog.read_text(), "- [ ] ST-001 | synthetic task\n")
                self.assertEqual(set(p.name for p in root.iterdir()), {"automation", "tool", "git", "gh", "codex", "kimi", "pnpm", "python3", "curl", "timeout"})


if __name__ == "__main__":
    unittest.main()
