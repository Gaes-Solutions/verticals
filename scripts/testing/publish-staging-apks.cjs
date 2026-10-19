#!/usr/bin/env node
"use strict";

// No shell, token output, or local network calls outside the explicit gh commands.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const verificationReasons = Object.freeze({
  MANIFEST_INVALID: "Invalid repository, release identity, or source/payload commits",
  APK_METADATA_INVALID: "Invalid APK metadata",
  APK_INTEGRITY_MISMATCH: "Local APK integrity check failed",
  RELEASE_ASSET_SET_INVALID: "Incomplete or duplicate release asset set",
  RELEASE_ASSET_METADATA_MISMATCH: "Remote asset metadata mismatch",
  RELEASE_ASSET_HASH_MISMATCH: "Downloaded release asset integrity check failed",
  RELEASE_TAG_TARGET_MISMATCH: "Release tag does not point to approved source commit",
  RELEASE_IDENTITY_MISMATCH: "Existing release identity does not match approved manifest",
  PUBLISHED_TAG_MISSING: "Published release tag is missing",
  NEW_RELEASE_NOT_DRAFT: "New release must remain a draft until verification",
  DRAFT_FOREIGN_ASSETS: "Draft contains unexpected assets; refusing to modify it",
  RELEASE_STILL_DRAFT: "Release is still a draft",
  LOCAL_FILE_MISSING: "A required local publication file is missing",
  LOCAL_DISK_FULL: "Local storage could not hold publication files",
  LOCAL_PERMISSION_DENIED: "Local publication files could not be accessed",
  INVALID_JSON: "Publication metadata contains invalid JSON",
  DRAFT_NOT_VISIBLE: "New draft was not visible after bounded verification",
  RELEASE_NOT_VISIBLE: "Release was not visible after bounded verification",
  RELEASE_ASSETS_PENDING: "Release assets were not ready after bounded verification",
  UNEXPECTED_FAILURE: "Publication verification or local preparation failed",
});
class PublicationVerificationError extends Error {
  constructor(reasonCode) {
    super(verificationReasons[reasonCode]);
    this.reasonCode = reasonCode;
  }
}
function publicationDiagnostic(error) {
  const github = error?.githubDiagnostic;
  if (
    github &&
    ["api", "release create", "release upload", "release download", "release edit"].includes(
      github.operation,
    )
  ) {
    return {
      operation: github.operation,
      httpStatus: /^\d{3}$/.test(github.httpStatus) ? github.httpStatus : null,
      exitCode: Number.isInteger(github.exitCode) ? github.exitCode : null,
      terminated: github.terminated === true,
    };
  }
  const filesystem = {
    ENOENT: "LOCAL_FILE_MISSING",
    ENOSPC: "LOCAL_DISK_FULL",
    EACCES: "LOCAL_PERMISSION_DENIED",
    EPERM: "LOCAL_PERMISSION_DENIED",
  };
  const reasonCode =
    error instanceof PublicationVerificationError &&
    Object.hasOwn(verificationReasons, error.reasonCode)
      ? error.reasonCode
      : typeof error?.code === "string" && Object.hasOwn(filesystem, error.code)
        ? filesystem[error.code]
        : error instanceof SyntaxError
          ? "INVALID_JSON"
          : "UNEXPECTED_FAILURE";
  return { operation: "verification", reasonCode, reason: verificationReasons[reasonCode] };
}
function diagnosticMessage(diagnostic) {
  if (diagnostic.operation === "verification") return diagnostic.reason;
  return `GitHub CLI operation failed (${diagnostic.operation}; HTTP ${diagnostic.httpStatus || "unavailable"}; exit ${diagnostic.exitCode ?? "unavailable"}${diagnostic.terminated ? ", terminated" : ""})`;
}

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
    throw new PublicationVerificationError("MANIFEST_INVALID");
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
      throw new PublicationVerificationError("APK_METADATA_INVALID");
    }
    const file = path.join(nativeDir, `${kind}.apk`);
    const size = fs.statSync(file).size;
    if (size < 1 || size >= 100 * 1024 * 1024 || hash(file) !== item.sha256)
      throw new PublicationVerificationError("APK_INTEGRITY_MISMATCH");
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

function assetsPending(current, expected, temp) {
  if (
    !Array.isArray(current.assets) ||
    new Set(current.assets.map((asset) => asset.name)).size !== current.assets.length
  )
    throw new PublicationVerificationError("RELEASE_ASSET_SET_INVALID");
  let pending = current.assets.length < expected.size;
  for (const asset of current.assets) {
    const sum = expected.get(asset.name);
    if (!sum) throw new PublicationVerificationError("RELEASE_ASSET_SET_INVALID");
    if (asset.digest && asset.digest !== `sha256:${sum}`)
      throw new PublicationVerificationError("RELEASE_ASSET_METADATA_MISMATCH");
    if (asset.state === "uploaded") {
      if (asset.size !== fs.statSync(path.join(temp, asset.name)).size)
        throw new PublicationVerificationError("RELEASE_ASSET_METADATA_MISMATCH");
    } else if (["new", "processing"].includes(asset.state)) pending = true;
    else throw new PublicationVerificationError("RELEASE_ASSET_METADATA_MISMATCH");
  }
  return pending;
}

function verifyAssets({ current, expected, temp, run, release, repo, hash }) {
  if (
    current.assets.length !== expected.size ||
    new Set(current.assets.map((a) => a.name)).size !== expected.size
  )
    throw new PublicationVerificationError("RELEASE_ASSET_SET_INVALID");
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
      throw new PublicationVerificationError("RELEASE_ASSET_METADATA_MISMATCH");
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
      throw new PublicationVerificationError("RELEASE_ASSET_HASH_MISMATCH");
  }
}

function publish({
  manifestPath,
  notesPath,
  nativeDir,
  repo,
  gh = "gh",
  wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
}) {
  // Only repeat reads after our own mutations, with at most30s total delay.
  let remainingReadWait = 30_000;
  const readAfterMutation = (read) => {
    const delays = [1000, 2000, 4000, 8000];
    for (let attempt = 0; ; attempt++) {
      const result = read();
      if (!result.pending) return result.value;
      const delay = delays[attempt];
      if (!delay || delay > remainingReadWait)
        throw new PublicationVerificationError(result.pending);
      wait(delay);
      remainingReadWait -= delay;
    }
  };
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
      const stderr = String(error.stderr);
      const httpStatus = /(?:HTTP\s+|\()(\d{3})(?:\)|\b)/.exec(stderr)?.[1];
      const operation = args[0] === "api" ? "api" : `release ${args[1]}`;
      const exitCode = Number.isInteger(error.status) ? error.status : null;
      const exitStatus = String(exitCode ?? "unavailable");
      const reason = error.signal ? ", terminated" : "";
      const safe = new Error(
        `GitHub CLI operation failed (${operation}; HTTP ${httpStatus || "unavailable"}; exit ${exitStatus}${reason})`,
      );
      safe.githubDiagnostic = {
        operation,
        httpStatus: httpStatus || null,
        exitCode,
        terminated: Boolean(error.signal),
      };
      safe.notFound = httpStatus === "404";
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
        throw new PublicationVerificationError("RELEASE_TAG_TARGET_MISMATCH");
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
        throw new PublicationVerificationError("RELEASE_IDENTITY_MISMATCH");
      const target = tagTarget();
      if (!value.draft && !target) throw new PublicationVerificationError("PUBLISHED_TAG_MISSING");
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
      existing = readAfterMutation(() => {
        const value = releaseByTag();
        if (!value) return { pending: "DRAFT_NOT_VISIBLE" };
        assertOwned(value);
        if (!value.draft) throw new PublicationVerificationError("NEW_RELEASE_NOT_DRAFT");
        return { value };
      });
    }
    if (existing.draft) {
      const foreignAssets = existing.assets.filter((asset) => !expected.has(asset.name));
      if (foreignAssets.length) throw new PublicationVerificationError("DRAFT_FOREIGN_ASSETS");
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
    const current = existing.draft
      ? readAfterMutation(() => {
          const value = releaseByTag();
          if (!value) return { pending: "RELEASE_NOT_VISIBLE" };
          assertOwned(value);
          const pending = assetsPending(value, expected, temp);
          return pending ? { pending: "RELEASE_ASSETS_PENDING" } : { value };
        })
      : releaseByTag();
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
    const final = current.draft
      ? readAfterMutation(() => {
          const value = releaseByTag();
          if (!value) return { pending: "RELEASE_NOT_VISIBLE" };
          assertOwned(value);
          return value.draft ? { pending: "RELEASE_STILL_DRAFT" } : { value };
        })
      : releaseByTag();
    assertOwned(final);
    if (final.draft) throw new PublicationVerificationError("RELEASE_STILL_DRAFT");
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

function writePublicationReport(report) {
  if (!process.env.RUNNER_TEMP) return;
  const directory = path.join(process.env.RUNNER_TEMP, "native", "results");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "publication.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

module.exports = { publish, publicationDiagnostic };
if (require.main === module) {
  try {
    const result = publish({
      manifestPath: process.argv[2] || path.join(__dirname, "android-staging-artifacts.json"),
      notesPath: process.argv[3] || path.join(__dirname, "android-staging-release-notes.md"),
      nativeDir: path.join(process.env.RUNNER_TEMP || os.tmpdir(), "native"),
      repo: process.env.GITHUB_REPOSITORY,
    });
    writePublicationReport({ status: "success", ...result });
    console.log(JSON.stringify(result));
  } catch (error) {
    const diagnostic = publicationDiagnostic(error);
    try {
      writePublicationReport({ status: "failure", diagnostic });
    } catch {
      console.error("Could not save publication diagnostic report");
    }
    console.error(diagnosticMessage(diagnostic));
    process.exitCode = 1;
  }
}
