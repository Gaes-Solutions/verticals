/** Fixture for the disposable local runner only; all writes die with its database. */
const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
module.exports = async function seedShopper(app, helpers, db) {
  const url = new URL(process.env.DATABASE_URL_MASTER);
  assert(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.match(url.pathname, /^\/qa_platform_\d+$/);
  const slug = "test-e2e-shopper";
  await helpers.createTestTenant(slug, "QA Tienda Comprador");
  await helpers.createTenantUser(slug, {
    email: "dueno@shopper.example.invalid",
    password: "E2ePruebas!2026",
    rolCodigo: "dueno",
    nombre: "QA Dueño",
  });
  async function request(method, url, payload, token) {
    const r = await app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    });
    assert(r.statusCode >= 200 && r.statusCode < 300, `${method} ${url}: ${r.statusCode}`);
    return r.json();
  }
  const login = await request("POST", "/auth/tenant/login", {
    tenantSlug: slug,
    email: "dueno@shopper.example.invalid",
    password: "E2ePruebas!2026",
  });
  const token = login.accessToken;
  assert.equal(typeof token, "string");
  const category = await request("POST", "/t/categorias", { nombre: "QA", slug: "qa" }, token);
  const branches = await request("GET", "/t/sucursales", null, token);
  const product = await request(
    "POST",
    "/t/productos",
    {
      skuPadre: "QA-P",
      nombre: "Producto QA",
      categoriaId: category.id,
      precioBase: "12.00",
      claveSat: "50181900",
      claveUnidadSat: "H87",
    },
    token,
  );
  const variant = product.variantes[0].id;
  await request(
    "POST",
    "/t/inventario/ajustes",
    {
      varianteId: variant,
      sucursalId: branches[0].id,
      tipo: "ajuste_positivo",
      cantidad: "10",
      motivo: "Fixture local shopper",
    },
    token,
  );
  await request(
    "POST",
    "/t/ecommerce/productos-publicados",
    {
      productoId: product.id,
      tituloPublico: "Producto QA",
      slugSeo: "producto-qa",
      descripcionMd: "Producto publicado de prueba local",
      destacadoHome: true,
    },
    token,
  );
  // A second real publication proves search excludes unrelated products.
  const other = await request(
    "POST",
    "/t/productos",
    {
      skuPadre: "QA-OTRO",
      nombre: "Artículo distinto",
      categoriaId: category.id,
      precioBase: "19.00",
      claveSat: "50181900",
      claveUnidadSat: "H87",
    },
    token,
  );
  await request(
    "POST",
    "/t/ecommerce/productos-publicados",
    {
      productoId: other.id,
      tituloPublico: "Artículo distinto",
      slugSeo: "articulo-distinto",
    },
    token,
  );
  await request(
    "PUT",
    "/t/ecommerce/config",
    {
      subdominio: "qa-shopper",
      nombre: "QA Tienda Comprador",
      activa: true,
    },
    token,
  );
  if (process.env.SHOPPER_ORDER_FLOW_TESTS === "true") {
    await request("PUT", `/t/envios/pickup/${branches[0].id}`, { activa: true }, token);
  }
  const tc = db.getTenantClient(slug);
  const customer = await tc.cliente.create({
    data: {
      nombre: "QA Comprador",
      emailPrincipal: "buyer@shopper.example.invalid",
      passwordHash: await helpers.hash("Antes!2026"),
    },
  });
  const valid = randomBytes(32).toString("hex");
  const expired = randomBytes(32).toString("hex");
  for (const [token, deadline] of [
    [valid, Date.now() + 3600000],
    [expired, Date.now() - 60000],
  ]) {
    await tc.clientePasswordReset.create({
      data: {
        clienteId: customer.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiraEn: new Date(deadline),
      },
    });
  }
  const recoveryValid = `rec_${randomBytes(12).toString("hex")}`;
  const recoveryExpired = `rec_${randomBytes(12).toString("hex")}`;
  for (const [code, status] of [
    [recoveryValid, "abandonado"],
    [recoveryExpired, "expirado"],
  ]) {
    await tc.carritoEcommerce.create({
      data: {
        recoveryCodigo: code,
        status,
        abandonadoAt: new Date(Date.now() - 86400000),
        items: [
          { varianteId: variant, nombre: "Producto QA", precioUnitario: "12.00", cantidad: "2" },
        ],
        subtotal: "24",
        total: "24",
      },
    });
  }
  const recovery = {
    password: {
      valid,
      expired,
      invalid: randomBytes(32).toString("hex"),
      email: "buyer@shopper.example.invalid",
      oldPassword: "Antes!2026",
      newPassword: "Despues!2026",
    },
    cart: {
      valid: recoveryValid,
      expired: recoveryExpired,
      invalid: `rec_${randomBytes(12).toString("hex")}`,
    },
  };
  const baseline = {
    orders: await tc.pedido.count(),
    ecommerceOrders: await tc.pedidoEcommerce.count(),
    sales: await tc.venta.count(),
    inventory: (await tc.inventarioSucursal.findMany({ where: { varianteId: variant } })).map(
      (r) => ({
        varianteId: r.varianteId,
        stock: String(r.stockActual),
        reserved: String(r.stockReservado),
      }),
    ),
  };
  return {
    recovery,
    baseline,
    ...(process.env.SHOPPER_ORDER_FLOW_TESTS === "true"
      ? {
          order: {
            email: "guest-order@shopper.example.invalid",
            sucursalId: branches[0].id,
            checkoutAttempts: await tc.checkoutAttempt.count(),
          },
        }
      : {}),
    titulo: "Producto QA",
    slugSeo: "producto-qa",
    varianteId: variant,
    precio: "12.00",
  };
};
