#!/usr/bin/env node
"use strict";

// No shell, token output, or local network calls outside the explicit gh commands.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function validateManifest(manifest, repo) {
  const sha = /^[a-f0-9]{40}$/;
  const release = manifest.release;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo || "") ||
    !release ||
    !/^qa-android-[a-zA-Z0-9._-]+$/.test(release.tag) ||
    !release.title ||
    /[\r\n]/.test(release.title) ||
    !sha.test(release.sourceCommit) ||
    manifest.source?.commit !== release.sourceCommit ||
    !sha.test(manifest.payloadCommit) ||
    manifest.payloadCommit === release.sourceCommit
  ) {
    throw new Error("Invalid repository, release identity, or source/payload commits");
  }
}

function prepareArtifacts(manifest, nativeDir, temp, hash) {
  const digest = /^[a-f0-9]{64}$/;
  const expected = new Map();
  for (const kind of ["client", "kiosk"]) {
    const item = manifest[kind];
    if (
      !item ||
      !/^gaesland-pruebas-[a-z]+-v\d+\.apk$/.test(item.filename) ||
      !Number.isSafeInteger(item.version) ||
      item.version < 1 ||
      !digest.test(item.sha256) ||
      expected.has(item.filename)
    ) {
      throw new Error("Invalid APK metadata");
    }
    const file = path.join(nativeDir, `${kind}.apk`);
    const size = fs.statSync(file).size;
    if (size < 1 || size >= 100 * 1024 * 1024 || hash(file) !== item.sha256)
      throw new Error("Local APK integrity check failed");
    fs.copyFileSync(file, path.join(temp, item.filename));
    expected.set(item.filename, item.sha256);
  }
  fs.writeFileSync(path.join(temp, "source.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // SHA256SUMS includes source provenance; its own digest is verified separately.
  expected.set("source.json", hash(path.join(temp, "source.json")));
  fs.writeFileSync(
    path.join(temp, "SHA256SUMS"),
    [...expected].map(([name, sum]) => `${sum}  ${name}\n`).join(""),
  );
  expected.set("SHA256SUMS", hash(path.join(temp, "SHA256SUMS")));
  return expected;
}

function verifyAssets({ current, expected, temp, run, release, repo, hash }) {
  if (
    current.assets.length !== expected.size ||
    new Set(current.assets.map((a) => a.name)).size !== expected.size
  )
    throw new Error("Incomplete or duplicate release asset set");
  const downloadDir = path.join(temp, "download");
  fs.mkdirSync(downloadDir);
  for (const asset of current.assets) {
    const sum = expected.get(asset.name);
    if (
      !sum ||
      asset.state !== "uploaded" ||
      asset.size !== fs.statSync(path.join(temp, asset.name)).size ||
      (asset.digest && asset.digest !== `sha256:${sum}`)
    )
      throw new Error("Remote asset metadata mismatch");
    run([
      "release",
      "download",
      release.tag,
      "--repo",
      repo,
      "--pattern",
      asset.name,
      "--dir",
      downloadDir,
    ]);
    if (hash(path.join(downloadDir, asset.name)) !== sum)
      throw new Error("Downloaded release asset integrity check failed");
  }
}

function publish({ manifestPath, notesPath, nativeDir, repo, gh = "gh" }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest, repo);
  const release = manifest.release;
  const run = (args) => {
    try {
      return execFileSync(gh, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      });
    } catch (error) {
      // Never echo CLI stderr: it may include private transport details.
      const safe = new Error("GitHub CLI operation failed");
      safe.notFound = /(?:HTTP 404|\(404\))/.test(String(error.stderr));
      throw safe;
    }
  };
  const api = (suffix) => JSON.parse(run(["api", `repos/${repo}/${suffix}`]));
  const optional = (suffix) => {
    try {
      return api(suffix);
    } catch (error) {
      if (error.notFound) return null;
      throw error;
    }
  };
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-release-"));
  try {
    const expected = prepareArtifacts(manifest, nativeDir, temp, hash);
    const tagTarget = () => {
      const ref = optional(`git/ref/tags/${release.tag}`);
      if (!ref) return null;
      let object = ref.object;
      for (let depth = 0; object.type === "tag" && depth < 5; depth++)
        object = api(`git/tags/${object.sha}`).object;
      if (object.type !== "commit" || object.sha !== release.sourceCommit)
        throw new Error("Release tag does not point to approved source commit");
      return object.sha;
    };
    // The by-tag REST endpoint is for published releases. List authenticated
    // releases so matching drafts are visible and retries do not create duplicates.
    const releaseByTag = () => {
      for (let page = 1; ; page++) {
        const entries = api(`releases?per_page=100&page=${page}`);
        const found = entries.find((entry) => entry.tag_name === release.tag);
        if (found) return found;
        if (entries.length < 100) return null;
      }
    };
    let existing = releaseByTag();
    const assertOwned = (value) => {
      if (
        !value ||
        value.tag_name !== release.tag ||
        value.name !== release.title ||
        !value.prerelease ||
        value.target_commitish !== release.sourceCommit
      )
        throw new Error("Existing release identity does not match approved manifest");
      const target = tagTarget();
      if (!value.draft && !target) throw new Error("Published release tag is missing");
    };
    if (existing) assertOwned(existing);
    else {
      tagTarget(); // Reject a pre-existing tag on the wrong commit before creating anything.
      run([
        "release",
        "create",
        release.tag,
        "--repo",
        repo,
        "--title",
        release.title,
        "--target",
        release.sourceCommit,
        "--draft",
        "--prerelease",
        "--latest=false",
        "--notes-file",
        notesPath,
      ]);
      existing = releaseByTag();
      assertOwned(existing);
      if (!existing.draft) throw new Error("New release must remain a draft until verification");
    }
    if (existing.draft) {
      const foreignAssets = existing.assets.filter((asset) => !expected.has(asset.name));
      if (foreignAssets.length)
        throw new Error("Draft contains unexpected assets; refusing to modify it");
      run([
        "release",
        "upload",
        release.tag,
        ...[...expected.keys()].map((name) => path.join(temp, name)),
        "--repo",
        repo,
        "--clobber",
      ]);
    }
    const current = releaseByTag();
    assertOwned(current);
    verifyAssets({ current, expected, temp, run, release, repo, hash });
    if (current.draft)
      run([
        "release",
        "edit",
        release.tag,
        "--repo",
        repo,
        "--draft=false",
        "--prerelease",
        "--latest=false",
      ]);
    const final = releaseByTag();
    assertOwned(final);
    if (final.draft) throw new Error("Release is still a draft");
    return {
      tag: release.tag,
      sourceCommit: release.sourceCommit,
      assets: Object.fromEntries(expected),
      published: true,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { publish };
if (require.main === module) {
  try {
    const result = publish({
      manifestPath: process.argv[2] || path.join(__dirname, "android-staging-artifacts.json"),
      notesPath: process.argv[3] || path.join(__dirname, "android-staging-release-notes.md"),
      nativeDir: path.join(process.env.RUNNER_TEMP || os.tmpdir(), "native"),
      repo: process.env.GITHUB_REPOSITORY,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
