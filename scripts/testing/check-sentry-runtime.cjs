#!/usr/bin/env node
// Validate the installed SDK and production init/privacy helpers without a real
// DSN. Source is transpiled in memory; only the transport is replaced for tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const mode = process.argv[2];
if (!mode) {
  for (const order of ["before", "after"]) {
    const child = spawnSync(process.execPath, [__filename, order], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, SENTRY_DSN: "", SENTRY_RELEASE: "synthetic-sdk-check" },
    });
    assert.equal(child.status, 0, child.error?.message ?? child.stderr);
    process.stdout.write(child.stdout);
  }
} else {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
async function main() {
  process.env.SENTRY_DSN = "";
  let networkAttempts = 0;
  const denyNetwork = () => {
    networkAttempts++;
    throw new Error("Network forbidden in Sentry QA");
  };
  globalThis.fetch = denyNetwork;
  for (const name of ["node:http", "node:https"]) {
    const http = require(name);
    http.request = denyNetwork;
    http.get = denyNetwork;
  }
  const api = Module.createRequire(path.join(root, "apps/api/package.json"));
  const typescript = require("typescript");
  const sdk = api("@sentry/node");
  const envelopes = [];
  let options;
  const sdkForSource = {
    ...sdk,
    init(input) {
      options = input;
      return sdk.init({
        ...input,
        transport: () => ({
          send(envelope) {
            envelopes.push(envelope);
            return Promise.resolve({ statusCode: 200 });
          },
          flush() {
            return Promise.resolve(true);
          },
        }),
      });
    },
  };
  const loaded = new Map();
  function loadSource(name) {
    if (loaded.has(name)) return loaded.get(name);
    const filename = path.join(root, "apps/api/src/observability", `${name}.ts`);
    const source = typescript.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    const compiled = new Module(filename);
    compiled.require = (request) => {
      if (request === "@sentry/node") return sdkForSource;
      if (request === "./sentry-privacy.js") return loadSource("sentry-privacy");
      return api(request);
    };
    compiled._compile(source, filename);
    loaded.set(name, compiled.exports);
    return compiled.exports;
  }
  let Fastify;
  if (mode === "before") Fastify = api("fastify");
  const { initSentry, captureError } = loadSource("sentry");
  initSentry();
  captureError(new Error("Synthetic absent DSN"));
  assert.equal(envelopes.length, 0);
  process.env.SENTRY_DSN = "https://00000000000000000000000000000000@example.invalid/1";
  process.env.SENTRY_TRACES_SAMPLE_RATE = "1";
  initSentry();
  assert.equal(options.tracesSampleRate, 1);
  for (const hook of ["beforeSend", "beforeSendSpan", "beforeSendTransaction"])
    assert.equal(typeof options[hook], "function");
  sdk.setTag("db.user", "synthetic-db-identity");
  await sdk.startSpan(
    {
      name: "synthetic-checkout",
      op: "http.server",
      forceTransaction: true,
      attributes: { "db.user": "synthetic-root-user", "db.system": "postgresql" },
    },
    async () => {
      await sdk.startSpan(
        {
          name: "synthetic-db-query",
          op: "db",
          attributes: {
            "db.user": "synthetic-child-user",
            "db.username": "synthetic-name",
            "db.user.name": "synthetic-third-name",
            "db.system": "postgresql",
          },
        },
        async () =>
          captureError(new Error("Synthetic captureError"), { screen: "checkout-prototype" }),
      );
    },
  );
  if (!Fastify) Fastify = api("fastify");
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    captureError(error, { screen: "fastify-prototype" });
    reply.code(500).send({ error: "synthetic" });
  });
  app.get("/synthetic-error", async () => {
    throw new Error("Synthetic Fastify error");
  });
  const response = await app.inject({ method: "GET", url: "/synthetic-error" });
  assert.equal(response.statusCode, 500);
  await app.close();
  await sdk.flush(2000);
  await sdk.close(2000);
  const entries = envelopes.flatMap((envelope) => envelope[1]);
  const events = entries
    .filter(([header]) => header.type === "event")
    .map(([, payload]) => payload);
  const transactions = entries
    .filter(([header]) => header.type === "transaction")
    .map(([, payload]) => payload);
  const matches = (event, message) =>
    event.exception?.values?.some((value) => value.value === message);
  const error = events.find((event) => matches(event, "Synthetic captureError"));
  assert(error);
  assert.equal(error.extra.screen, "checkout-prototype");
  assert.equal(events.filter((event) => matches(event, "Synthetic Fastify error")).length, 1);
  const transaction = transactions.find((event) => event.transaction === "synthetic-checkout");
  assert(transaction);
  assert.equal(transaction.contexts.trace.data["db.system"], "postgresql");
  assert(transaction.spans.some((span) => span.description === "synthetic-db-query"));
  for (const event of [...events, ...transactions]) {
    const fields = [
      event.tags,
      event.contexts?.trace?.data,
      event.contexts?.trace?.tags,
      ...(event.spans ?? []).map((span) => span.data),
    ];
    for (const field of fields)
      for (const key of ["db.user", "db.username", "db.user.name"])
        assert(!(key in (field ?? {})), `Database identity leaked: ${key}`);
  }
  assert.equal(networkAttempts, 0);
  console.log(
    JSON.stringify({
      sdk: sdk.SDK_VERSION,
      fastifyImport: `${mode} init`,
      events: events.length,
      transactions: transactions.length,
      privacyHooks: "passed",
      networkAttempts,
    }),
  );
}
