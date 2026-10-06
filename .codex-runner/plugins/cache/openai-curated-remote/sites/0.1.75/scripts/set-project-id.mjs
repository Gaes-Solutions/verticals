import { lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const [flag, projectId, ...extra] = process.argv.slice(2);

try {
  if (flag !== "--project-id" || !projectId?.trim() || extra.length) {
    throw new Error("Usage: set-project-id.mjs --project-id <project_id>");
  }

  const directory = path.resolve(".openai");
  const directoryStat = lstatSync(directory, { throwIfNoEntry: false });
  if (directoryStat && !directoryStat.isDirectory()) {
    throw new Error(".openai must be a real directory.");
  }
  const destination = path.join(directory, "hosting.json");
  const fileStat = lstatSync(destination, { throwIfNoEntry: false });
  if (fileStat && !fileStat.isFile()) {
    throw new Error(".openai/hosting.json must be a regular file.");
  }

  let manifest = {};
  if (fileStat) {
    try {
      manifest = JSON.parse(readFileSync(destination, "utf8"));
    } catch {
      throw new Error(".openai/hosting.json must contain a valid JSON object.");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error(".openai/hosting.json must contain a valid JSON object.");
    }
  }
  if (manifest.project_id != null && manifest.project_id !== "" && manifest.project_id !== projectId) {
    throw new Error("The manifest already belongs to a different Site.");
  }

  if (manifest.project_id !== projectId) {
    manifest.project_id = projectId;
    mkdirSync(directory, { recursive: true });
    const temporary = mkdtempSync(path.join(directory, ".hosting-"));
    try {
      const file = path.join(temporary, "hosting.json");
      writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
      renameSync(file, destination);
    } finally {
      try { rmSync(temporary, { recursive: true, force: true }); } catch {}
    }
  }
  console.log(JSON.stringify({ project_id: projectId, manifest_persisted: true }));
} catch (error) {
  console.error(error.code ? `Unable to save Site identity (${error.code}).` : error.message);
  process.exitCode = 1;
}
