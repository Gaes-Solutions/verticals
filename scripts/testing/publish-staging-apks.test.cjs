"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { publish, publicationDiagnostic } = require("./publish-staging-apks.cjs");

function fixture(t, mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaes-release-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
  const manifest = {
    release: { tag: "qa-android-test", title: "Approved QA", sourceCommit: "a".repeat(40) },
    source: {
      commit: "a".repeat(40),
      client: { files: ["client.ts"], sha256: "c".repeat(64) },
      kiosk: { files: ["kiosk.ts"], sha256: "d".repeat(64) },
    },
    payloadCommit: "b".repeat(40),
    client: { filename: "gaesland-pruebas-cliente-v15.apk", version: 15, sha256: hash("client") },
    kiosk: { filename: "gaesland-pruebas-kiosko-v4.apk", version: 4, sha256: hash("kiosk") },
  };
  fs.writeFileSync(path.join(dir, "client.apk"), "client");
  fs.writeFileSync(path.join(dir, "kiosk.apk"), "kiosk");
  const manifestPath = path.join(dir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const notesPath = path.join(dir, "notes.md");
  fs.writeFileSync(notesPath, "Only staging");
  const statePath = path.join(dir, "state.json");
  fs.writeFileSync(
    statePath,
    JSON.stringify({ mode, commands: [], release: null, tag: null, data: {} }),
  );
  const gh = path.join(dir, "gh");
  // Real execFileSync invokes this fake CLI in isolated child processes. No network.
  fs.writeFileSync(
    gh,
    `#!${process.execPath}\n${String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'state.json'),s=JSON.parse(fs.readFileSync(file)),a=process.argv.slice(2);
s.commands.push(a); const save=()=>fs.writeFileSync(file,JSON.stringify(s));
const fail=()=>{save(); console.error('HTTP 404');process.exit(1)};
const out=x=>{save();console.log(JSON.stringify(x))};
if(a[0]==='api') {
 if(a[1].includes('/releases?')) {
  if(s.release && !s.release.assets.length && ['eventual-create','missing-create'].includes(s.mode)) {
   s.createReads=(s.createReads||0)+1;
   if(s.mode==='missing-create'||s.createReads<=2)out([]);else out([s.release]);
  } else if(s.release && s.release.assets.length && ['eventual-upload','missing-upload'].includes(s.mode)) {
   s.assetReads=(s.assetReads||0)+1;
   if(s.mode==='missing-upload'||s.assetReads===1)out([{...s.release,assets:s.release.assets.slice(0,1)}]);
   else if(s.assetReads===2)out([{...s.release,assets:s.release.assets.map(x=>({...x,state:'processing',size:0}))}]);
   else out([s.release]);
  } else out(s.release?[s.release]:[]);
 }
 else if(a[1].includes('/git/ref/')) {if(!s.tag)fail();out({object:{type:'commit',sha:s.tag}});}
 else throw Error('unexpected api');
} else if(a[1]==='create') {
 if(s.mode==='create-failure'){save();console.error('HTTP 403 https://private.example/signed?token=secret-token');process.exit(1);}
 s.release={tag_name:a[2],name:'Approved QA',target_commitish:'a'.repeat(40),prerelease:true,draft:true,assets:[]};
 if(s.mode==='badidentity')s.release.name='private signed?token=secret-token';
 s.tag=s.mode==='badtarget'?'f'.repeat(40):'a'.repeat(40);save();
} else if(a[1]==='upload') {
 for(const file of a.slice(3,a.indexOf('--repo'))) {
  const name=path.basename(file),bytes=fs.readFileSync(file);
  s.data[name]=bytes.toString('base64');
  const asset={name,size:bytes.length,state:'uploaded',digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')};
  if(s.mode==='badmetadata')asset.digest='sha256:'+'0'.repeat(64);
  s.release.assets=s.release.assets.filter(x=>x.name!==name).concat(asset);
  if(s.mode==='partial'){save();console.error('simulated upload failure');process.exit(1);}
 } save();
} else if(a[1]==='download') {
 const name=a[a.indexOf('--pattern')+1],dir=a[a.indexOf('--dir')+1];
 fs.writeFileSync(path.join(dir,name),s.mode==='tamper'?'wrong':Buffer.from(s.data[name],'base64'));save();
} else if(a[1]==='edit'){s.release.draft=false;save();}
else throw Error('unexpected command');
`}`,
  );
  fs.chmodSync(gh, 0o700);
  const waits = [];
  return {
    waits,
    run: () =>
      publish({
        manifestPath,
        notesPath,
        nativeDir: dir,
        repo: "owner/repo",
        gh,
        wait: (ms) => waits.push(ms),
      }),
    state: () => JSON.parse(fs.readFileSync(statePath)),
    setMode: (mode) => {
      const s = JSON.parse(fs.readFileSync(statePath));
      s.mode = mode;
      fs.writeFileSync(statePath, JSON.stringify(s));
    },
    dir,
  };
}

test("complete draft is downloaded and verified before public promotion", (t) => {
  const f = fixture(t, "happy");
  const result = f.run();
  const s = f.state();
  assert.equal(result.published, true);
  assert.equal(s.release.draft, false);
  assert.equal(s.release.assets.length, 4);
  const edit = s.commands.findIndex((c) => c[1] === "edit");
  assert.equal(s.commands.slice(0, edit).filter((c) => c[1] === "download").length, 4);
  assert.ok(s.commands.find((c) => c[1] === "create").includes("--draft"));
  assert.ok(s.commands[edit].includes("--latest=false"));
});
test("partial upload remains draft and a retry resumes it", (t) => {
  const f = fixture(t, "partial");
  assert.throws(f.run, /CLI operation failed/);
  assert.equal(f.state().release.draft, true);
  assert.equal(
    f.state().commands.some((c) => c[1] === "edit"),
    false,
  );
  f.setMode("happy");
  f.run();
  assert.equal(f.state().commands.filter((c) => c[1] === "create").length, 1);
  assert.equal(f.state().release.draft, false);
});
test("tampered downloads cannot publish", (t) => {
  const f = fixture(t, "tamper");
  assert.throws(f.run, /Downloaded release asset integrity/);
  assert.equal(f.state().release.draft, true);
  assert.equal(
    f.state().commands.some((c) => c[1] === "edit"),
    false,
  );
});
test("wrong tag target fails before upload", (t) => {
  const f = fixture(t, "badtarget");
  assert.throws(f.run, /approved source commit/);
  assert.equal(
    f.state().commands.some((c) => c[1] === "upload"),
    false,
  );
});
test("published matching release rerun only verifies without mutations", (t) => {
  const f = fixture(t, "happy");
  f.run();
  const before = f.state().commands.length;
  f.run();
  const next = f.state().commands.slice(before);
  assert.equal(next.filter((c) => c[1] === "download").length, 4);
  assert.equal(
    next.some((c) => ["create", "upload", "edit"].includes(c[1])),
    false,
  );
});
test("local artifact tamper fails before any GitHub call", (t) => {
  const f = fixture(t, "happy");
  fs.writeFileSync(path.join(f.dir, "client.apk"), "wrong");
  assert.throws(f.run, /Local APK integrity/);
  assert.equal(f.state().commands.length, 0);
});

test("CLI diagnostics expose only operation and status, never private stderr", (t) => {
  const f = fixture(t, "create-failure");
  assert.throws(f.run, (error) => {
    assert.match(error.message, /release create; HTTP 403; exit 1/);
    assert.doesNotMatch(error.message, /private\.example|secret-token|signed/);
    return true;
  });
  assert.equal(
    f.state().commands.some((c) => c[1] === "upload"),
    false,
  );
});

for (const mode of ["happy", "create-failure"]) {
  test(`CLI persists safe publication evidence for ${mode}`, (t) => {
    const f = fixture(t, mode);
    fs.mkdirSync(path.join(f.dir, "native"));
    for (const name of ["client.apk", "kiosk.apk"]) {
      fs.copyFileSync(path.join(f.dir, name), path.join(f.dir, "native", name));
    }
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "publish-staging-apks.cjs"),
        path.join(f.dir, "manifest.json"),
        path.join(f.dir, "notes.md"),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          RUNNER_TEMP: f.dir,
          GITHUB_REPOSITORY: "owner/repo",
          PATH: `${f.dir}${path.delimiter}${process.env.PATH}`,
        },
        timeout: 10000,
      },
    );
    const raw = fs.readFileSync(path.join(f.dir, "native", "results", "publication.json"), "utf8");
    const report = JSON.parse(raw);
    assert.doesNotMatch(
      raw + result.stdout + result.stderr,
      /private\.example|secret-token|signed\?/,
    );
    if (mode === "happy") {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.status, "success");
      assert.equal(report.published, true);
      assert.equal(Object.keys(report.assets).length, 4);
    } else {
      assert.equal(result.status, 1);
      assert.equal(report.status, "failure");
      assert.deepEqual(report.diagnostic, {
        operation: "release create",
        httpStatus: "403",
        exitCode: 1,
        terminated: false,
      });
      assert.equal(f.state().release, null);
    }
  });
}

for (const [mode, code] of [
  ["badtarget", "RELEASE_TAG_TARGET_MISMATCH"],
  ["badidentity", "RELEASE_IDENTITY_MISMATCH"],
  ["badmetadata", "RELEASE_ASSET_METADATA_MISMATCH"],
  ["tamper", "RELEASE_ASSET_HASH_MISMATCH"],
]) {
  test(`safe verification reason and no retry for ${mode}`, (t) => {
    const f = fixture(t, mode);
    assert.throws(f.run, (error) => {
      assert.equal(error.reasonCode, code);
      const diagnostic = publicationDiagnostic(error);
      assert.equal(diagnostic.operation, "verification");
      assert.equal(diagnostic.reasonCode, code);
      assert.doesNotMatch(JSON.stringify(diagnostic), /secret-token|signed\?|private/);
      return true;
    });
    assert.deepEqual(f.waits, []);
    assert.equal(
      f.state().commands.some((c) => c[1] === "edit"),
      false,
    );
    if (mode === "tamper")
      assert.equal(f.state().commands.filter((c) => c[1] === "download").length, 1);
  });
}
test("local integrity mismatch has a precise safe reason before GitHub calls", (t) => {
  const f = fixture(t, "happy");
  fs.writeFileSync(path.join(f.dir, "client.apk"), "wrong");
  assert.throws(f.run, (e) => publicationDiagnostic(e).reasonCode === "APK_INTEGRITY_MISMATCH");
  assert.equal(f.state().commands.length, 0);
});
for (const mode of ["eventual-create", "eventual-upload"]) {
  test(`bounded read polling handles ${mode} without repeating writes`, (t) => {
    const f = fixture(t, mode);
    assert.equal(f.run().published, true);
    assert.deepEqual(f.waits, [1000, 2000]);
    for (const name of ["create", "upload", "edit"])
      assert.equal(f.state().commands.filter((c) => c[1] === name).length, 1);
  });
}
for (const [mode, code] of [
  ["missing-create", "DRAFT_NOT_VISIBLE"],
  ["missing-upload", "RELEASE_ASSETS_PENDING"],
]) {
  test(`persistent ${mode} fails closed with bounded safe evidence`, (t) => {
    const f = fixture(t, mode);
    assert.throws(f.run, (e) => publicationDiagnostic(e).reasonCode === code);
    assert.deepEqual(f.waits, [1000, 2000, 4000, 8000]);
    assert.equal(f.state().commands.filter((c) => c[1] === "create").length, 1);
    assert.equal(
      f.state().commands.filter((c) => c[1] === "upload").length,
      mode === "missing-upload" ? 1 : 0,
    );
    assert.equal(
      f.state().commands.some((c) => c[1] === "edit"),
      false,
    );
  });
}
test("unknown errors and known filesystem errors never expose private messages, stderr or paths", () => {
  for (const [error, code] of [
    [new Error("private signed?token=secret-token /home/private"), "UNEXPECTED_FAILURE"],
    [
      Object.assign(new Error("secret-token"), { code: "ENOENT", stderr: "private" }),
      "LOCAL_FILE_MISSING",
    ],
    [Object.assign(new Error("secret-token"), { code: "ENOSPC" }), "LOCAL_DISK_FULL"],
    [Object.assign(new Error("secret-token"), { code: "EACCES" }), "LOCAL_PERMISSION_DENIED"],
    [new SyntaxError("private signed?token=secret-token"), "INVALID_JSON"],
  ]) {
    const diagnostic = publicationDiagnostic(error);
    assert.equal(diagnostic.reasonCode, code);
    assert.doesNotMatch(JSON.stringify(diagnostic), /secret-token|signed\?|private|\/home/);
  }
});

test("CLI persists whitelisted verification codes without leaking a remote identity or local path", (t) => {
  for (const [mode, code] of [
    ["badtarget", "RELEASE_TAG_TARGET_MISMATCH"],
    ["badidentity", "RELEASE_IDENTITY_MISMATCH"],
    ["badmetadata", "RELEASE_ASSET_METADATA_MISMATCH"],
    ["tamper", "RELEASE_ASSET_HASH_MISMATCH"],
    ["localtamper", "APK_INTEGRITY_MISMATCH"],
  ]) {
    const f = fixture(t, mode);
    fs.mkdirSync(path.join(f.dir, "native"));
    for (const name of ["client.apk", "kiosk.apk"])
      fs.copyFileSync(path.join(f.dir, name), path.join(f.dir, "native", name));
    if (mode === "localtamper") fs.writeFileSync(path.join(f.dir, "native", "client.apk"), "wrong");
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "publish-staging-apks.cjs"),
        path.join(f.dir, "manifest.json"),
        path.join(f.dir, "notes.md"),
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          RUNNER_TEMP: f.dir,
          GITHUB_REPOSITORY: "owner/repo",
          PATH: `${f.dir}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.status, 1);
    const raw = fs.readFileSync(path.join(f.dir, "native", "results", "publication.json"), "utf8");
    const report = JSON.parse(raw);
    assert.equal(report.status, "failure");
    assert.equal(report.diagnostic.operation, "verification");
    assert.equal(report.diagnostic.reasonCode, code);
    assert.doesNotMatch(
      raw + result.stdout + result.stderr,
      /private|secret-token|signed\?|gaes-release-test-/,
    );
    assert.equal(
      f.state().commands.some((command) => command[1] === "edit"),
      false,
    );
  }
});
