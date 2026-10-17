/** Actual components + Chromium virtual authenticator + local real WebAuthn verification.
 * No real account, device, payment or production writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium, expect } = require("@playwright/test");
const app = path.join(process.cwd(), "apps/web-tienda");
const esbuild = require(
  require.resolve("esbuild", { paths: [app, path.join(process.cwd(), "node_modules/vite")] }),
);
const webauthn = require(
  require.resolve("@simplewebauthn/server", { paths: [path.join(process.cwd(), "apps/api")] }),
);
(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: app,
    stdin: {
      resolveDir: app,
      loader: "tsx",
      contents: `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {CustomerPasskeys,PasskeyLogin} from './src/components/customer-passkeys';function QA(){const [owner,setOwner]=useState('A');const [view,setView]=useState('account');window.switchOwner=setOwner;window.switchView=setView;return view==='account'?<CustomerPasskeys key={owner}/>:<PasskeyLogin destino='/checkout' onBusyChange={v=>{window.loginBusy=v}}/>}createRoot(document.getElementById('root')).render(<QA/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "router",
        setup(build) {
          build.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              "export const useRouter=()=>({push(p){window.navigated=p},refresh(){window.refreshed=true}})",
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (req.url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      res.end(process.env.PASSKEY_QA_CSS ? fs.readFileSync(process.env.PASSKEY_QA_CSS) : "");
    } else
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>',
      );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "es-MX",
  });
  let stage = "setup";
  let groups = 0;
  try {
    await context.addInitScript(() => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (ms) => timeout(Math.min(ms, 1000));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const authenticator = (
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
    ).authenticatorId;
    let keys = [];
    const credentials = new Map();
    const challenges = new Map();
    let mode = {};
    let afterWriteListFailure = false;
    let mutations = 0;
    let registrations = 0;
    let authentications = 0;
    const seed = {
      id: "seed",
      deviceName: "Teléfono QA",
      createdAt: "2026-10-17T12:00:00Z",
      lastUsedAt: null,
    };
    await page.route("**/api/**", async (route) => {
      assert.equal(new URL(route.request().url()).origin, base);
      const action = route.request().url().split("/").pop();
      const body = route.request().postDataJSON();
      const failure = mode[action];
      if (["remove", "register-verify", "login-verify"].includes(action)) mutations++;
      if (failure === "network") return route.abort();
      if (failure === "timeout") {
        await new Promise((r) => setTimeout(r, 1600));
        return route.fulfill({ json: {} }).catch(() => {});
      }
      if (failure === "slow") await new Promise((r) => setTimeout(r, 600));
      if (failure === "malformed") return route.fulfill({ json: {} });
      if (failure === "401")
        return route.fulfill({ status: 401, json: { message: "PRIVATE SERVER ERROR" } });
      if (failure === "429")
        return route.fulfill({ status: 429, json: { message: "PRIVATE SERVER ERROR" } });
      let result;
      if (action === "list") result = keys;
      else if (action === "register-options" || action === "login-options") {
        const options =
          action === "register-options"
            ? await webauthn.generateRegistrationOptions({
                rpID: "localhost",
                rpName: "QA",
                userID: Buffer.from("synthetic-owner"),
                userName: "qa@example.invalid",
                userDisplayName: "QA",
                attestationType: "none",
                authenticatorSelection: { residentKey: "required", userVerification: "required" },
              })
            : await webauthn.generateAuthenticationOptions({
                rpID: "localhost",
                userVerification: "required",
              });
        const challengeToken = randomUUID();
        challenges.set(challengeToken, { challenge: options.challenge, action });
        result = { options, challengeToken };
      } else if (action === "register-verify") {
        const proof = challenges.get(body.challengeToken);
        assert.equal(proof.action, "register-options");
        const verified = await webauthn.verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: proof.challenge,
          expectedOrigin: base,
          expectedRPID: "localhost",
          requireUserVerification: true,
        });
        assert.equal(verified.verified, true);
        assert.equal(verified.registrationInfo.userVerified, true);
        registrations++;
        credentials.set(body.response.id, verified.registrationInfo.credential);
        const key = { ...seed, id: body.response.id, deviceName: body.deviceName };
        keys = [...keys, key];
        result = { ok: true };
        if (afterWriteListFailure) mode.list = "network";
      } else if (action === "login-verify") {
        const proof = challenges.get(body.challengeToken);
        assert.equal(proof.action, "login-options");
        const verified = await webauthn.verifyAuthenticationResponse({
          response: body.response,
          expectedChallenge: proof.challenge,
          expectedOrigin: base,
          expectedRPID: "localhost",
          credential: credentials.get(body.response.id),
          requireUserVerification: true,
        });
        assert.equal(verified.verified, true);
        assert.equal(verified.authenticationInfo.userVerified, true);
        authentications++;
        result = { cliente: { id: "synthetic-owner", nombre: "QA", email: "qa@example.invalid" } };
      } else if (action === "remove") {
        if (failure !== "still-present") keys = keys.filter((k) => k.id !== body.id);
        result = { ok: true };
        if (afterWriteListFailure) mode.list = "network";
      } else throw Error("Unmocked action");
      return route.fulfill({ json: result }).catch(() => {});
    });
    const section = () => page.getByRole("region", { name: "Huella y llaves de acceso" });
    const refresh = () => section().getByRole("button", { name: "Actualizar llaves", exact: true });
    const configure = () =>
      section().getByRole("button", { name: "Configurar huella o llave de acceso", exact: true });
    const openRemove = () =>
      section()
        .getByRole("button", { name: /^Eliminar llave / })
        .first();
    const dialog = () =>
      page.getByRole("dialog", { name: "Eliminar llave de acceso", exact: true });
    const confirm = () => dialog().getByRole("button", { name: "Eliminar llave", exact: true });
    const reset = async (newKeys = []) => {
      mode = {};
      afterWriteListFailure = false;
      keys = newKeys;
      await page.goto(base);
      await expect(refresh()).toBeEnabled();
    };
    const fill = async () => {
      await section().getByLabel("Nombre del dispositivo").fill("Mi huella QA");
      await section().getByLabel("Confirma tu contraseña").fill("synthetic-password");
    };
    const pass = (label) => {
      groups++;
      console.log(`PASS ${label}`);
    };
    stage = "malformed list never becomes empty success";
    mode.list = "malformed";
    await page.goto(base);
    await expect(section().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(configure()).toBeDisabled();
    await expect(section().getByText("Todavía no tienes llaves", { exact: false })).toHaveCount(0);
    mode.list = undefined;
    await refresh().click();
    await expect(configure()).toBeEnabled();
    pass(stage);
    stage = "real registration, verified UV and single submission";
    await fill();
    let before = mutations;
    await section()
      .locator("form")
      .evaluate((el) => {
        el.requestSubmit();
        el.requestSubmit();
      });
    await expect(
      section().getByRole("status").filter({ hasText: "Llave de acceso guardada" }),
    ).toContainText("Llave de acceso guardada");
    assert.equal(mutations, before + 1);
    assert.equal(registrations, 1);
    await expect(section().getByText("Mi huella QA", { exact: true })).toBeVisible();
    await expect(section().getByLabel("Confirma tu contraseña")).toHaveValue("");
    pass(stage);
    stage = "actual browser authentication and signed assertion";
    await page.evaluate(() => window.switchView("login"));
    await page.getByRole("button", { name: "Entrar con huella o llave de acceso" }).click();
    await expect.poll(() => page.evaluate(() => window.navigated)).toBe("/checkout");
    assert.equal(authentications, 1);
    pass(stage);
    stage = "malformed login options never open a ceremony";
    await reset();
    await page.evaluate(() => window.switchView("login"));
    mode["login-options"] = "malformed";
    before = mutations;
    await page.getByRole("button", { name: "Entrar con huella o llave de acceso" }).click();
    await expect(page.getByRole("alert")).toContainText("No pudimos confirmar");
    assert.equal(mutations, before);
    assert.equal(await page.evaluate(() => window.navigated), undefined);
    pass(stage);
    stage = "malformed login receipt never navigates";
    await reset();
    await page.evaluate(() => window.switchView("login"));
    mode["login-verify"] = "malformed";
    await page.getByRole("button", { name: "Entrar con huella o llave de acceso" }).click();
    await expect(page.getByRole("alert")).toContainText("No pudimos confirmar");
    assert.equal(await page.evaluate(() => window.navigated), undefined);
    pass(stage);
    stage = "login prompt cancellation unlocks controls";
    await reset();
    await page.evaluate(() => window.switchView("login"));
    await cdp.send("WebAuthn.setAutomaticPresenceSimulation", {
      authenticatorId: authenticator,
      enabled: false,
    });
    await page.getByRole("button", { name: "Entrar con huella o llave de acceso" }).click();
    await expect(page.getByRole("button", { name: "Cancelar verificación" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar verificación" }).click();
    await expect(
      page.getByRole("button", { name: "Entrar con huella o llave de acceso" }),
    ).toBeEnabled();
    assert.equal(await page.evaluate(() => window.loginBusy), false);
    await cdp.send("WebAuthn.setAutomaticPresenceSimulation", {
      authenticatorId: authenticator,
      enabled: true,
    });
    pass(stage);
    for (const failure of ["malformed", "network", "timeout"]) {
      stage = `uncertain removal ${failure} requires verified refresh`;
      await reset([seed]);
      await openRemove().click();
      await expect(dialog()).toBeVisible();
      mode.remove = failure;
      before = mutations;
      await confirm().evaluate((el) => {
        el.click();
        el.click();
      });
      await expect(dialog()).toHaveCount(0);
      await expect(section().getByRole("alert")).toContainText("No pudimos confirmar");
      assert.equal(mutations, before + 1);
      await expect(openRemove()).toBeDisabled();
      await expect(section().getByText("Teléfono QA", { exact: true })).toBeVisible();
      mode.remove = undefined;
      await refresh().click();
      await expect(openRemove()).toBeEnabled();
      assert.equal(mutations, before + 1);
      pass(stage);
    }
    stage = "native accessible confirmation cancels and restores focus";
    await reset([seed]);
    await openRemove().click();
    await page.keyboard.press("Escape");
    await expect(dialog()).toHaveCount(0);
    assert.equal(await openRemove().evaluate((el) => el === document.activeElement), true);
    pass(stage);
    stage = "confirmed remove reconciles list before success";
    await reset([seed]);
    await openRemove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(section().getByRole("status")).toHaveText("Llave eliminada de esta cuenta.");
    await expect(section().getByText("Todavía no tienes llaves", { exact: false })).toBeVisible();
    pass(stage);
    assert.equal(await refresh().evaluate((el) => el === document.activeElement), true);
    stage = "stale read cannot override a removal";
    await reset([seed]);
    mode.list = "slow";
    await refresh().click();
    await expect(refresh()).toBeDisabled();
    await expect(openRemove()).toBeDisabled();
    await expect(refresh()).toBeEnabled();
    mode.list = undefined;
    await openRemove().click();
    await confirm().click();
    await expect(section().getByRole("status")).toHaveText("Llave eliminada de esta cuenta.");
    pass(stage);
    stage = "success receipt with unchanged server list is not a deleted key";
    await reset([seed]);
    mode.remove = "still-present";
    await openRemove().click();
    await confirm().click();
    await expect(dialog()).toHaveCount(0);
    await expect(section().getByRole("alert")).toContainText("sigue en la lista");
    await expect(openRemove()).toBeDisabled();
    pass(stage);
    stage = "confirmed registration survives list refresh failure";
    await reset();
    afterWriteListFailure = true;
    await fill();
    await configure().click();
    await expect(
      section().getByRole("status").filter({ hasText: "Llave de acceso guardada" }),
    ).toContainText("Llave de acceso guardada");
    await expect(section().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(configure()).toBeDisabled();
    mode.list = undefined;
    await refresh().click();
    await expect(configure()).toBeEnabled();
    await expect(section().getByText("Mi huella QA", { exact: true })).toBeVisible();
    pass(stage);
    stage = "uncertain registration requires refresh and never repeats automatically";
    await reset();
    await fill();
    mode["register-verify"] = "malformed";
    before = mutations;
    await configure().click();
    await expect(section().getByRole("alert")).toContainText("No pudimos confirmar");
    await expect(configure()).toBeDisabled();
    mode["register-verify"] = undefined;
    await refresh().click();
    await expect(configure()).toBeEnabled();
    assert.equal(mutations, before + 1);
    pass(stage);
    stage = "expired session clears listed private metadata";
    await reset([seed]);
    mode.list = "401";
    await refresh().click();
    await expect(section().getByRole("alert")).toContainText("Revisa tu sesión");
    await expect(section().getByText("Teléfono QA", { exact: true })).toHaveCount(0);
    await expect(configure()).toBeDisabled();
    pass(stage);
    stage = "rate limit does not expose upstream internals";
    await reset();
    await fill();
    mode["register-options"] = "429";
    await configure().click();
    await expect(section().getByRole("alert")).toContainText("demasiados intentos");
    assert(!(await section().innerText()).includes("PRIVATE"));
    await expect(configure()).toBeEnabled();
    pass(stage);
    stage = "account change aborts pending registration and clears password";
    await reset();
    await fill();
    mode["register-options"] = "slow";
    await configure().click();
    await page.evaluate(() => window.switchOwner("B"));
    await expect(section().getByLabel("Confirma tu contraseña")).toHaveValue("");
    await expect(configure()).toBeEnabled();
    await page.waitForTimeout(800);
    await expect(section().getByRole("status")).toHaveCount(0);
    pass(stage);
    stage = "cancel during follow-up read recovers refresh button";
    await reset();
    await fill();
    mode.list = "slow";
    await configure().click();
    await expect(
      section().getByRole("status").filter({ hasText: "Llave de acceso guardada" }),
    ).toContainText("Llave de acceso guardada");
    await section().getByRole("button", { name: "Cancelar verificación" }).click();
    await expect(refresh()).toBeEnabled();
    await expect(configure()).toBeDisabled();
    mode.list = undefined;
    await refresh().click();
    await expect(configure()).toBeEnabled();
    pass(stage);
    stage = "ten-key limit and whitespace device name";
    await reset(Array.from({ length: 10 }, (_, i) => ({ ...seed, id: `key-${i}` })));
    await expect(configure()).toBeDisabled();
    await reset();
    await section().getByLabel("Nombre del dispositivo").fill(" ");
    await section().getByLabel("Confirma tu contraseña").fill("synthetic-password");
    before = mutations;
    await configure().click();
    assert.equal(mutations, before);
    pass(stage);
    if (process.env.PASSKEY_QA_CSS) {
      stage = "mobile layout";
      await reset([seed]);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const b of [refresh(), configure(), openRemove()])
        assert((await b.boundingBox()).height >= 44);
      await openRemove().click();
      assert((await confirm().boundingBox()).height >= 44);
      pass(stage);
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        groups,
        registrations,
        authentications,
        errors: errors.length,
        scope: "local virtual authenticator and real WebAuthn crypto; no real account writes",
      }),
    );
  } catch (e) {
    console.error(`FAIL ${stage}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})();
