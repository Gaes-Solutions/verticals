/** Published Q&A with browser-only mutations. Real checks are auth/read/invalid-input only.
 * PRODUCT_FORMS_ACCOUNT: private buyer {email,password}; never printed or changed.
 * No questions, stock subscriptions, staff notices or emails are created on the server. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { chromium, expect } = require("@playwright/test");
const base = "https://web-tienda-staging.up.railway.app";
let stage = "setup";
(async () => {
  const browser = await chromium.launch();
  let context;
  let groups = 0;
  let ownerPath;
  const pass = () => {
    groups++;
    console.log(`PASS ${stage}`);
  };
  try {
    const setup = async (guest = false) => {
      if (context) await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const f = {
        mode: "ok",
        owner: "qa-owner-a",
        posts: [],
        rows: new Map(),
        release: null,
        errors: [],
      };
      page.on("pageerror", (e) => f.errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        if (/^\/api\/cuenta\/productos\/[A-Za-z0-9_-]+\/preguntas$/.test(pathname)) {
          ownerPath = pathname;
          if (req.method() === "GET")
            return guest
              ? route.continue()
              : route.fulfill({ json: { clienteId: f.owner, tenantSlug: "qa-store" } });
          assert.equal(req.method(), "POST");
          const body = req.postDataJSON();
          f.posts.push(body);
          if (f.mode === "changed") {
            f.owner = "qa-owner-b";
            return route.fulfill({ status: 409, json: { code: "SESSION_CHANGED" } });
          }
          f.rows.set(body.solicitudId, body);
          if (f.mode === "delayed")
            await new Promise((r) => {
              f.release = r;
            });
          const options =
            f.mode === "wrong"
              ? { json: { id: "wrong-id" } }
              : f.mode === "uncertain"
                ? { status: 503, json: {} }
                : { status: 201, json: { id: body.solicitudId } };
          return route.fulfill(options).catch(() => {});
        }
        return req.method() === "GET" ? route.continue() : route.abort();
      });
      await page.goto(`${base}/producto/demo-lampara`, { waitUntil: "domcontentloaded" });
      const region = page.getByRole("region", { name: "Preguntas y respuestas", exact: true });
      const input = region.getByLabel("Pregunta", { exact: true });
      if (!guest) await expect(input).toBeEditable();
      return {
        page,
        f,
        region,
        input,
        send: () => region.getByRole("button", { name: "Preguntar", exact: true }),
      };
    };
    stage = "published guest sees actual login requirement and a return-to-product link";
    let t = await setup(true);
    await expect(
      t.region.getByRole("link", { name: "Iniciar sesión para preguntar" }),
    ).toHaveAttribute("href", "/cuenta/login?next=%2Fproducto%2Fdemo-lampara");
    await expect(t.input).toHaveCount(0);
    assert.equal(t.f.posts.length, 0);
    assert.deepEqual(t.f.errors, []);
    pass();
    stage =
      "published question double click sends one intercepted request and requires an exact receipt";
    t = await setup();
    await t.input.fill("Pregunta sintética QA que no se enviará al servidor.");
    t.f.mode = "delayed";
    await t.send().evaluate((b) => {
      b.click();
      b.click();
    });
    await expect.poll(() => t.f.posts.length).toBe(1);
    t.f.release();
    await expect(t.region.getByRole("status")).toContainText("Tu pregunta quedó registrada");
    assert.deepEqual(t.f.errors, []);
    pass();
    for (const mode of ["wrong", "uncertain"]) {
      stage = `published ${mode} receipt keeps the draft and retries the same key; no real question`;
      t = await setup();
      await t.input.fill("Pregunta sintética QA que no se enviará al servidor.");
      t.f.mode = mode;
      await t.send().click();
      await expect(t.region.getByRole("alert")).toBeVisible();
      await expect(t.input).toHaveValue("Pregunta sintética QA que no se enviará al servidor.");
      t.f.mode = "ok";
      await t.region.getByRole("button", { name: "Reintentar esta pregunta", exact: true }).click();
      await expect(t.region.getByRole("status")).toContainText("Tu pregunta quedó registrada");
      assert.equal(t.f.posts.length, 2);
      assert.deepEqual(t.f.posts[0], t.f.posts[1]);
      assert.equal(t.f.rows.size, 1);
      assert.deepEqual(t.f.errors, []);
      pass();
    }
    stage =
      "published session-change receipt remounts an empty form for the newly verified account";
    t = await setup();
    await t.input.fill("Pregunta privada de la cuenta QA anterior.");
    t.f.mode = "changed";
    await t.send().click();
    await expect(t.input).toBeEditable();
    await expect(t.input).toHaveValue("");
    assert.equal(t.f.posts[0].clienteIdEsperado, "qa-owner-a");
    assert.equal(t.f.posts.length, 1);
    assert.deepEqual(t.f.errors, []);
    pass();
    stage = "published 320px question form has no horizontal overflow and uses 44px controls";
    t = await setup();
    await t.page.setViewportSize({ width: 320, height: 700 });
    assert(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const control of [t.input, t.send()]) assert((await control.boundingBox()).height >= 44);
    assert.deepEqual(t.f.errors, []);
    pass();
    stage = "real stock BFF rejects foreign origin and invalid input before registration";
    const foreign = await context.request.post(`${base}/api/avisos-stock`, {
      headers: { origin: "https://evil.invalid" },
      data: {},
    });
    assert.equal(foreign.status(), 403);
    assert.equal(foreign.headers()["cache-control"], "private, no-store");
    const invalid = await context.request.post(`${base}/api/avisos-stock`, {
      headers: { origin: base },
      data: { productoPublicadoId: "qa-nonexistent", email: "invalid" },
    });
    assert.equal(invalid.status(), 400);
    assert.equal(invalid.headers()["cache-control"], "private, no-store");
    const absent = await context.request.post(`${base}/api/avisos-stock`, {
      headers: { origin: base },
      data: {
        productoPublicadoId: `qa-nonexistent-${randomUUID()}`,
        email: "qa-nonexistent@example.invalid",
      },
    });
    assert.equal(absent.status(), 404);
    pass();
    stage = "real guest Q&A owner read and write are private 401 responses";
    assert(ownerPath);
    const guest = await context.request.get(`${base}${ownerPath}`);
    assert.equal(guest.status(), 401);
    assert.equal(guest.headers()["cache-control"], "private, no-store");
    const guestWrite = await context.request.post(`${base}${ownerPath}`, {
      headers: { origin: base },
      data: {},
    });
    assert.equal(guestWrite.status(), 401);
    pass();
    if (process.env.PRODUCT_FORMS_ACCOUNT) {
      const a = JSON.parse(fs.readFileSync(process.env.PRODUCT_FORMS_ACCOUNT, "utf8"));
      stage = "buyer authentication for read-only and rejected-input checks";
      const login = await context.request.post(`${base}/api/cuenta/login`, {
        data: { email: a.email, password: a.password },
      });
      assert.equal(login.status(), 200);
      stage = "buyer reads only the minimal verified Q&A owner";
      const response = await context.request.get(`${base}${ownerPath}`);
      assert.equal(response.status(), 200);
      const owner = await response.json();
      assert.deepEqual(Object.keys(owner).sort(), ["clienteId", "tenantSlug"]);
      assert.equal(typeof owner.clienteId, "string");
      assert.equal(response.headers()["cache-control"], "private, no-store");
      pass();
      const nonce = randomUUID();
      const safePath = `/api/cuenta/productos/qa-nonexistent-${nonce}/preguntas`;
      stage =
        "buyer changed-owner guard rejects before forwarding; nonexistent product is an additional safeguard";
      const mismatch = await context.request.post(`${base}${safePath}`, {
        headers: { origin: base },
        data: {
          pregunta: "Pregunta de comprobación que no debe registrarse.",
          solicitudId: randomUUID(),
          clienteIdEsperado: "qa-other-owner",
        },
      });
      assert.equal(mismatch.status(), 409);
      assert.equal((await mismatch.json()).code, "SESSION_CHANGED");
      pass();
      stage = "buyer invalid question is rejected by BFF without notifying the store";
      const bad = await context.request.post(`${base}${safePath}`, {
        headers: { origin: base },
        data: { pregunta: "tiny", solicitudId: randomUUID(), clienteIdEsperado: owner.clienteId },
      });
      assert.equal(bad.status(), 400);
      pass();
      stage = "buyer new API route requires a request key before accessing a nonexistent product";
      const cookies = await context.cookies();
      const token = cookies.find((c) => c.name === "gaespos_cliente_token")?.value;
      assert(token);
      const direct = await context.request.post(
        `https://verticals-staging.up.railway.app/cliente-portal/productos/qa-nonexistent-${nonce}/preguntas/solicitudes`,
        {
          headers: { authorization: `Bearer ${token}` },
          data: { pregunta: "Pregunta de comprobación sin solicitud; debe rechazarse." },
        },
      );
      assert.equal(direct.status(), 400);
      pass();
    }
    console.log(
      `PASS ${groups} published product-form groups; writes intercepted or rejected before business mutation`,
    );
  } catch (e) {
    console.error(`FAIL ${stage}${stage.startsWith("buyer") ? "" : `: ${e.message}`}`);
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})();
