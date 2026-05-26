/**
 * Demo end-to-end Hito 3.1 — Abarrotes: recargas + Bait + IEPS
 *
 * Ejecuta contra una instancia LIVE de la API. REQUIERE arrancar la API con:
 *   RECARGA_PROVIDER=mock FISCAL_PROVIDER=mock pnpm dev:api
 *
 *   1. Login admin → tenant abarrotes + dueño + cajero
 *   2. Dueño configura proveedor recargas mock (saldo prefondeado $5000)
 *   3. Cajero abre caja
 *   4. Recarga Telcel $100 (cobra $102 con margen) → descuenta saldo prefondeado
 *   5. Pago Bait pospago $200
 *   6. Consulta saldos prefondeados por proveedor
 *   7. Producto con IEPS (cigarros 160%) → venta desglosa IEPS aparte de IVA
 *
 * Uso:  RECARGA_PROVIDER=mock FISCAL_PROVIDER=mock pnpm dev:api   (en otra terminal)
 *       pnpm --filter @gaespos/api demo:abarrotes
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const TENANT_SLUG = `demo-abarrotes-${Date.now().toString(36)}`;
const OWNER_EMAIL = `owner-${TENANT_SLUG}@demo.local`;
const OWNER_PASSWORD = "Owner!2026";
const CAJERO_EMAIL = `cajero-${TENANT_SLUG}@demo.local`;
const CAJERO_PASSWORD = "Cajero!2026";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

let stepNum = 0;
function step(title: string): void {
  stepNum += 1;
  console.log(`\n${c.bold}${c.cyan}━━━ Paso ${stepNum}: ${title}${c.reset}`);
}
function ok(line: string): void {
  console.log(`  ${c.green}✓${c.reset} ${line}`);
}
function info(line: string): void {
  console.log(`  ${c.dim}${line}${c.reset}`);
}
function moneyMX(s: string | number): string {
  const n = typeof s === "string" ? Number.parseFloat(s) : s;
  return `${c.yellow}$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${c.reset}`;
}

interface ApiResult<T = unknown> {
  status: number;
  body: T;
}
async function call<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, body: body as T };
}
function assertOk(r: ApiResult, expected: number, ctx: string): void {
  if (r.status !== expected) {
    console.error(`\n${c.red}✗ ${ctx}: esperaba ${expected}, recibió ${r.status}${c.reset}`);
    console.error(`${c.red}  body: ${JSON.stringify(r.body, null, 2)}${c.reset}`);
    process.exit(1);
  }
}

async function loginAdmin(): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertOk(r, 200, "admin login");
  return r.body.accessToken;
}
async function loginTenant(email: string, password: string): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/tenant/login", {
    body: { tenantSlug: TENANT_SLUG, email, password },
  });
  assertOk(r, 200, `tenant login ${email}`);
  return r.body.accessToken;
}

interface State {
  adminToken: string;
  ownerToken: string;
  cajeroToken: string;
  sucursalId: string;
  cajaId: string;
  aperturaId: string;
}

async function setup(state: State): Promise<void> {
  step("Login admin + tenant abarrotes + dueño + cajero");
  state.adminToken = await loginAdmin();
  const t = await call("POST", "/tenants", {
    token: state.adminToken,
    body: { slug: TENANT_SLUG, name: "Abarrotes Demo", planCode: "starter" },
  });
  assertOk(t, 201, "POST tenant");
  await call("POST", `/tenants/${TENANT_SLUG}/bootstrap-owner`, {
    token: state.adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dueño Abarrotes" },
  });
  state.ownerToken = await loginTenant(OWNER_EMAIL, OWNER_PASSWORD);
  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: state.ownerToken,
  });
  const cajeroRol = roles.body.find((r) => r.codigo === "cajero");
  await call("POST", "/t/usuarios", {
    token: state.ownerToken,
    body: {
      email: CAJERO_EMAIL,
      password: CAJERO_PASSWORD,
      nombre: "Cajero",
      rolIds: [cajeroRol?.id],
    },
  });
  state.cajeroToken = await loginTenant(CAJERO_EMAIL, CAJERO_PASSWORD);
  ok(`tenant ${TENANT_SLUG} + dueño + cajero listos`);

  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", {
    token: state.ownerToken,
  });
  state.sucursalId = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";
  const cajas = await call<Array<{ id: string; codigo: string }>>("GET", "/t/cajas", {
    token: state.ownerToken,
  });
  state.cajaId = cajas.body.find((c2) => c2.codigo === "CAJA-1")?.id ?? "";

  step("Cajero abre caja con fondo $100");
  const ap = await call<{ id: string }>("POST", `/t/cajas/${state.cajaId}/aperturar`, {
    token: state.cajeroToken,
    body: { montoInicial: "100" },
  });
  assertOk(ap, 201, "apertura caja");
  state.aperturaId = ap.body.id;
  ok("caja abierta");
}

async function configurarProveedor(state: State): Promise<void> {
  step("Dueño configura proveedor de recargas (mock) con saldo prefondeado $5,000");
  const cfg = await call<{ saldoPrefondeado: string; isPrimario: boolean }>(
    "PUT",
    "/t/recargas/proveedores/mock/config",
    {
      token: state.ownerToken,
      body: {
        apiKeyEncrypted: "stub-mock-key-demo",
        isPrimario: true,
        isActive: true,
        saldoPrefondeado: "5000",
        saldoAlertaMinimo: "500",
        comisionProveedorPct: 2,
      },
    },
  );
  assertOk(cfg, 200, "config proveedor");
  ok(
    `proveedor mock configurado: saldo prefondeado ${moneyMX(cfg.body.saldoPrefondeado)}, primario=${cfg.body.isPrimario}`,
  );
}

async function recargas(state: State): Promise<void> {
  step("Cajero procesa recarga Telcel $100 (cobra $102 con margen)");
  const r = await call<{
    folio: string;
    estado: string;
    montoCobradoCliente: string;
    comisionTenant: string;
  }>("POST", "/t/recargas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaAperturaId: state.aperturaId,
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "100",
      montoCobradoCliente: "102",
    },
  });
  assertOk(r, 201, "recarga telcel");
  ok(
    `recarga ${r.body.folio} → estado=${r.body.estado}, cobrado ${moneyMX(r.body.montoCobradoCliente)} (margen ${moneyMX(r.body.comisionTenant)})`,
  );

  step("Cajero procesa pago Bait pospago $200");
  const bait = await call<{ folio: string; estado: string }>("POST", "/t/recargas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaAperturaId: state.aperturaId,
      companiaCodigo: "bait_pospago",
      numeroTelefonico: "3311112222",
      montoSolicitado: "200",
      referenciaCapturada: "BAIT-CTA-998877",
    },
  });
  assertOk(bait, 201, "bait pago");
  ok(`pago Bait ${bait.body.folio} → estado=${bait.body.estado}`);

  step("Consulta saldos prefondeados por proveedor");
  const saldos = await call<Array<{ proveedorCodigo: string; saldoActual: string; bajo: boolean }>>(
    "GET",
    "/t/recargas/proveedores/saldos",
    { token: state.ownerToken },
  );
  assertOk(saldos, 200, "saldos");
  const mock = saldos.body.find((s) => s.proveedorCodigo === "mock");
  ok(
    `saldo mock tras 2 operaciones: ${moneyMX(mock?.saldoActual ?? "0")} (alerta bajo=${mock?.bajo})`,
  );
}

async function ieps(state: State): Promise<void> {
  step("Dueño crea producto con IEPS (cigarros 160%) + stock");
  const cat = await call<{ id: string }>("POST", "/t/categorias", {
    token: state.ownerToken,
    body: { nombre: "Cigarros", codigo: "CIG" },
  });
  const prod = await call<{ skuPadre: string; variantes: Array<{ id: string }> }>(
    "POST",
    "/t/productos",
    {
      token: state.ownerToken,
      body: {
        skuPadre: "CIG-001",
        nombre: "Cigarros 20s",
        categoriaId: cat.body.id,
        precioBase: "70",
        aplicaIva: true,
        tasaIva: "16",
        aplicaIeps: true,
        tasaIeps: { tipo: "porcentaje", valor: 160 },
      },
    },
  );
  assertOk(prod, 201, "crear producto IEPS");
  const varId = prod.body.variantes[0]?.id;
  if (!varId) throw new Error("variante cigarro faltante");
  ok(`producto ${prod.body.skuPadre} con IEPS 160% (precio $70 con impuestos incluidos)`);
  await call("POST", "/t/inventario/ajustes", {
    token: state.ownerToken,
    body: {
      varianteId: varId,
      sucursalId: state.sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "50",
      motivo: "Inventario inicial demo",
    },
  });

  step("Cajero vende 1 cajetilla → IEPS desglosado aparte del IVA");
  const venta = await call<{ ventaId: string; folio: string; total: string }>("POST", "/t/ventas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      lineas: [{ varianteId: varId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "70" }],
    },
  });
  assertOk(venta, 201, "venta cigarro");
  const detalle = await call<{
    subtotal: string;
    ivaTotal: string;
    iepsTotal: string;
    total: string;
  }>("GET", `/t/ventas/${venta.body.ventaId}`, { token: state.cajeroToken });
  assertOk(detalle, 200, "detalle venta");
  const base =
    Number(detalle.body.subtotal) - Number(detalle.body.iepsTotal) - Number(detalle.body.ivaTotal);
  ok(
    `venta ${venta.body.folio} — desglose fiscal del cigarro ($70 precio con impuestos incluidos):`,
  );
  info(`base gravable:  ${moneyMX(base)}`);
  info(
    `IEPS (160%):    ${moneyMX(detalle.body.iepsTotal)}  ← desglosado aparte del IVA (regla SAT)`,
  );
  info(`IVA (16%):      ${moneyMX(detalle.body.ivaTotal)}`);
  info(`total cobrado:  ${moneyMX(detalle.body.total)}`);
}

async function main(): Promise<void> {
  console.log(`${c.bold}${c.magenta}🛒 Demo Abarrotes — Recargas + Bait + IEPS${c.reset}`);
  console.log(`${c.dim}API: ${API_URL} · tenant: ${TENANT_SLUG}${c.reset}`);
  console.log(`${c.dim}(requiere API arrancada con RECARGA_PROVIDER=mock)${c.reset}`);
  const state = {} as State;
  await setup(state);
  await configurarProveedor(state);
  await recargas(state);
  await ieps(state);
  console.log(
    `\n${c.bold}${c.green}✅ Demo abarrotes completo — todos los pasos verdes${c.reset}\n`,
  );
}

main().catch((err) => {
  console.error(
    `\n${c.red}✗ Demo falló: ${err instanceof Error ? err.message : String(err)}${c.reset}`,
  );
  process.exit(1);
});

export {};
