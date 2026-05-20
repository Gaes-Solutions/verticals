/**
 * Demo end-to-end Hito 1 — Cajero retail completo
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000):
 *
 *   1. Login admin → crea tenant fresh + bootstrap-owner
 *   2. Login dueño → crea cajero + configura CFDI sandbox
 *   3. Crea categoría + marca + 3 productos con stock inicial
 *   4. Cajero abre caja con fondo $500
 *   5. Búsqueda producto por barcode (UX POS)
 *   6. Preview de precios → cobro multi-pago (tarjeta + efectivo) con cambio
 *   7. Emite CFDI 4.0 desde la venta (Mock Facturama → UUID válido)
 *   8. GET ticket JSON listo para Print Bridge (sucursal, líneas, totales, CFDI, autofactura URL)
 *   9. Movimientos manuales caja: entrada préstamo + salida gasto
 *  10. Corte X informativo (no cierra)
 *  11. Venta extra post-X
 *  12. Corte Z final con denominaciones contadas (calcula diferencia/cuadre)
 *  13. GET ticket JSON del corte Z
 *
 * Uso:
 *   pnpm --filter @gaespos/api demo:retail
 *
 * Variables entorno opcionales:
 *   API_URL              (default http://localhost:3000)
 *   SEED_ADMIN_EMAIL     (default admin@gaessoft.local)
 *   SEED_ADMIN_PASSWORD  (default ChangeMe!2026)
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const TENANT_SLUG = `demo-${Date.now().toString(36)}`;
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
      "Content-Type": "application/json",
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

async function checkApiUp(): Promise<void> {
  try {
    const r = await call("GET", "/health");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  } catch (err) {
    console.error(`${c.red}✗ API no responde en ${API_URL}: ${(err as Error).message}${c.reset}`);
    console.error(`${c.dim}  Arranca la API con: pnpm --filter @gaespos/api dev${c.reset}`);
    process.exit(1);
  }
}

interface State {
  adminToken: string;
  ownerToken: string;
  cajeroToken: string;
  sucursalId: string;
  cajaId: string;
  catId: string;
  marcaId: string;
  varCoca: string;
  varSabritas: string;
  varGalletas: string;
  aperturaId: string;
}

async function loginAdmin(): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertOk(r, 200, "login admin");
  return r.body.accessToken;
}

async function loginTenant(email: string, password: string): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/tenant/login", {
    body: { tenantSlug: TENANT_SLUG, email, password },
  });
  assertOk(r, 200, `tenant login ${email}`);
  return r.body.accessToken;
}

async function setupTenant(state: State): Promise<void> {
  step("Login admin + crea tenant fresh");
  state.adminToken = await loginAdmin();
  ok(`admin ${ADMIN_EMAIL} autenticado`);

  const t = await call("POST", "/tenants", {
    token: state.adminToken,
    body: { slug: TENANT_SLUG, name: `Demo ${TENANT_SLUG}`, planCode: "starter" },
  });
  assertOk(t, 201, "POST tenant");
  ok(
    `tenant ${TENANT_SLUG} creado con plan starter (seed roles + sucursal + caja + lista PUBLICO)`,
  );

  step("Bootstrap del dueño + login del dueño");
  const own = await call("POST", `/tenants/${TENANT_SLUG}/bootstrap-owner`, {
    token: state.adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dueño Demo" },
  });
  assertOk(own, 201, "bootstrap owner");
  state.ownerToken = await loginTenant(OWNER_EMAIL, OWNER_PASSWORD);
  ok(`dueño ${OWNER_EMAIL} creado con rol "dueno" wildcard`);

  step("Dueño crea cajero con rol preset 'cajero'");
  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: state.ownerToken,
  });
  const cajeroRol = roles.body.find((r) => r.codigo === "cajero");
  if (!cajeroRol) throw new Error("rol preset 'cajero' no sembrado");
  const u = await call<{ id: string }>("POST", "/t/usuarios", {
    token: state.ownerToken,
    body: {
      email: CAJERO_EMAIL,
      password: CAJERO_PASSWORD,
      nombre: "Cajero Demo",
      rolIds: [cajeroRol.id],
    },
  });
  assertOk(u, 201, "crear cajero");
  state.cajeroToken = await loginTenant(CAJERO_EMAIL, CAJERO_PASSWORD);
  ok(`cajero ${CAJERO_EMAIL} creado y autenticado`);
}

async function configurarCfdi(state: State): Promise<void> {
  step("Dueño configura CFDI sandbox del tenant");
  const r = await call("PUT", "/t/cfdis/config", {
    token: state.ownerToken,
    body: {
      rfcEmisor: "AAA010101AAA",
      razonSocialEmisor: `Demo ${TENANT_SLUG} SA`,
      regimenFiscalSat: "601",
      codigoPostalEmisor: "44100",
      lugarExpedicion: "44100",
      facturamaApiKey: "demo-sandbox-key-1234567890",
      facturamaAmbiente: "sandbox",
    },
  });
  if (r.status !== 200 && r.status !== 201) assertOk(r, 201, "PUT cfdi config");
  ok("CFDI sandbox configurado (RFC AAA010101AAA, régimen 601, Guadalajara)");
}

async function localizarSucursalYCaja(state: State): Promise<void> {
  step("Localiza SUC-PRINCIPAL + CAJA-1 sembradas por defecto");
  const sucs = await call<Array<{ id: string; codigo: string; nombre: string }>>(
    "GET",
    "/t/sucursales",
    { token: state.ownerToken },
  );
  const principal = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL");
  if (!principal) throw new Error("seed sin SUC-PRINCIPAL");
  state.sucursalId = principal.id;
  ok(`sucursal: ${principal.nombre} (${principal.codigo})`);

  const cajas = await call<Array<{ id: string; codigo: string; nombre: string }>>(
    "GET",
    "/t/cajas",
    { token: state.ownerToken },
  );
  const caja = cajas.body.find((c) => c.codigo === "CAJA-1");
  if (!caja) throw new Error("seed sin CAJA-1");
  state.cajaId = caja.id;
  ok(`caja: ${caja.nombre} (${caja.codigo})`);
}

async function crearProducto(
  state: State,
  sku: string,
  nombre: string,
  precio: string,
  barcode: string,
): Promise<string> {
  const r = await call<{ variantes: Array<{ id: string }> }>("POST", "/t/productos", {
    token: state.ownerToken,
    body: {
      skuPadre: sku,
      nombre,
      precioBase: precio,
      categoriaId: state.catId,
      marcaId: state.marcaId,
      codigoBarras: barcode,
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  assertOk(r, 201, `POST producto ${sku}`);
  const varianteId = r.body.variantes[0]?.id;
  if (!varianteId) throw new Error(`variante missing ${sku}`);

  await call("POST", "/t/inventario/ajustes", {
    token: state.ownerToken,
    body: {
      varianteId,
      sucursalId: state.sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "50",
      motivo: "Stock inicial demo",
    },
  });
  return varianteId;
}

async function crearCatalogo(state: State): Promise<void> {
  step("Dueño crea categoría + marca + 3 productos demo con stock 50 c/u");
  const cat = await call<{ id: string }>("POST", "/t/categorias", {
    token: state.ownerToken,
    body: { nombre: "Abarrotes", slug: "abarrotes" },
  });
  state.catId = cat.body.id;
  ok("categoría: Abarrotes");

  const marca = await call<{ id: string }>("POST", "/t/marcas", {
    token: state.ownerToken,
    body: { nombre: "Demo MX", slug: "demo-mx" },
  });
  state.marcaId = marca.body.id;
  ok("marca: Demo MX");

  state.varCoca = await crearProducto(
    state,
    "COCA-355",
    "Coca-Cola 355ml",
    "16.50",
    "7501055304226",
  );
  ok(`producto Coca-Cola 355ml @ ${moneyMX("16.50")} (barcode 7501055304226, stock 50)`);
  state.varSabritas = await crearProducto(
    state,
    "SABRITAS-45",
    "Sabritas Original 45g",
    "18.00",
    "7501030484523",
  );
  ok(`producto Sabritas 45g @ ${moneyMX("18.00")} (stock 50)`);
  state.varGalletas = await crearProducto(
    state,
    "EMP-150",
    "Galletas Emperador 150g",
    "21.50",
    "7501020602033",
  );
  ok(`producto Galletas Emperador @ ${moneyMX("21.50")} (stock 50)`);
}

async function abrirCaja(state: State): Promise<void> {
  step("Cajero abre caja CAJA-1 con $500 de fondo inicial");
  const r = await call<{ id: string }>("POST", `/t/cajas/${state.cajaId}/aperturar`, {
    token: state.cajeroToken,
    body: { montoInicial: "500", observaciones: "Apertura demo" },
  });
  assertOk(r, 201, "apertura caja");
  state.aperturaId = r.body.id;
  ok(`apertura activa (id=${state.aperturaId.slice(0, 12)}…)`);
}

async function buscarBarcode(state: State): Promise<void> {
  step("Cajero escanea barcode 7501055304226");
  const r = await call<{ nombre: string; variantes: Array<{ precioBase: string }> }>(
    "GET",
    "/t/productos/buscar/7501055304226",
    { token: state.cajeroToken },
  );
  assertOk(r, 200, "buscar barcode");
  ok(`encontrado en <100ms: ${r.body.nombre} @ ${moneyMX(r.body.variantes[0]!.precioBase)}`);
}

async function previewYCobrar(state: State): Promise<string> {
  step("Preview de precios + cobro venta multi-pago");
  const preview = await call<{ total: string; subtotal: string }>("POST", "/t/precios/preview", {
    token: state.cajeroToken,
    body: {
      lineas: [
        { varianteId: state.varCoca, cantidad: "2" },
        { varianteId: state.varSabritas, cantidad: "1" },
      ],
    },
  });
  assertOk(preview, 200, "preview");
  ok(
    `preview: 2× Coca (${moneyMX("16.50")}) + 1× Sabritas (${moneyMX("18.00")}) = ${moneyMX(preview.body.total)}`,
  );

  const r = await call<{ folio: string; total: string; cambioDado: string; ventaId: string }>(
    "POST",
    "/t/ventas",
    {
      token: state.cajeroToken,
      body: {
        sucursalId: state.sucursalId,
        cajaId: state.cajaId,
        lineas: [
          { varianteId: state.varCoca, cantidad: "2" },
          { varianteId: state.varSabritas, cantidad: "1" },
        ],
        pagos: [
          { metodo: "tarjeta_debito", monto: "30", ultimosCuatro: "1234" },
          { metodo: "efectivo", monto: "30" },
        ],
      },
    },
  );
  assertOk(r, 201, "POST venta");
  ok(
    `venta cobrada folio ${c.bold}${r.body.folio}${c.reset}, total ${moneyMX(r.body.total)}, cambio ${moneyMX(r.body.cambioDado)}`,
  );
  return r.body.ventaId;
}

async function emitirCfdi(state: State, ventaId: string): Promise<void> {
  step("Dueño emite CFDI 4.0 desde la venta cobrada (Facturama Mock)");
  const r = await call<{ folioFiscal: string }>("POST", `/t/ventas/${ventaId}/cfdi/emitir`, {
    token: state.ownerToken,
    body: {
      rfcReceptor: "ABC010101AB1",
      razonSocialReceptor: "Cliente Demo SA",
      codigoPostalReceptor: "44100",
      regimenFiscalReceptor: "612",
      usoCfdi: "G03",
      formaPago: "01",
      correoReceptor: "cliente@demo.com",
    },
  });
  assertOk(r, 201, "emitir CFDI");
  ok(`CFDI timbrado folio fiscal ${c.bold}${r.body.folioFiscal}${c.reset}`);
}

async function ticketVenta(state: State, ventaId: string): Promise<void> {
  step("GET ticket JSON de la venta listo para Print Bridge");
  const r = await call<{
    venta: { folio: string; cajero: string };
    totales: { total: string };
    cfdi: { folioFiscal: string; rfcReceptor: string } | null;
    autofactura: { urlPortal: string } | null;
  }>("GET", `/t/ventas/${ventaId}/ticket`, { token: state.cajeroToken });
  assertOk(r, 200, "GET ticket venta");
  ok(
    `ticket folio ${r.body.venta.folio} por ${r.body.venta.cajero}, total ${moneyMX(r.body.totales.total)}`,
  );
  if (r.body.cfdi) ok(`incluye CFDI ${r.body.cfdi.folioFiscal} para ${r.body.cfdi.rfcReceptor}`);
  if (r.body.autofactura) ok(`autofactura URL: ${r.body.autofactura.urlPortal}`);
}

async function movimientosCaja(state: State): Promise<void> {
  step("Cajero registra movimientos manuales de caja");
  const e = await call("POST", "/t/caja-movimientos", {
    token: state.cajeroToken,
    body: {
      aperturaId: state.aperturaId,
      tipo: "entrada_prestamo",
      monto: "200",
      motivo: "Cambio extra del gerente",
    },
  });
  assertOk(e, 201, "entrada préstamo");
  ok(`entrada +${moneyMX("200.00")} (préstamo del gerente)`);
  const s = await call("POST", "/t/caja-movimientos", {
    token: state.cajeroToken,
    body: {
      aperturaId: state.aperturaId,
      tipo: "salida_gasto",
      monto: "45",
      motivo: "Compra urgente de bolsas",
    },
  });
  assertOk(s, 201, "salida gasto");
  ok(`salida -${moneyMX("45.00")} (gasto bolsas)`);
}

async function corteX(state: State): Promise<void> {
  step("Dueño hace corte X informativo (no cierra caja)");
  const r = await call<{ diferencia: string }>("POST", "/t/cortes", {
    token: state.ownerToken,
    body: {
      aperturaId: state.aperturaId,
      tipo: "X",
      denominaciones: {
        billetes: { "500": 1, "200": 1, "100": 0, "50": 1, "20": 1, "1000": 0 },
        monedas: { "20": 0, "10": 4, "5": 0, "2": 0, "1": 0, "0.5": 0 },
      },
    },
  });
  assertOk(r, 201, "corte X");
  ok(`corte X creado, diferencia parcial ${moneyMX(r.body.diferencia)}`);
}

async function ventaExtra(
  state: State,
  varianteId: string,
  monto: string,
  etiqueta: string,
): Promise<void> {
  const r = await call<{ folio: string }>("POST", "/t/ventas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      lineas: [{ varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto }],
    },
  });
  assertOk(r, 201, `venta extra ${etiqueta}`);
  ok(`venta cobrada ${r.body.folio} (${etiqueta}, efectivo ${moneyMX(monto)})`);
}

async function corteZ(state: State): Promise<string> {
  step("Dueño hace corte Z final (cierra caja, bloquea ventas)");
  const teorico = 500 + 30 + 18 + 18 + 21.5 + 200 - 45;
  info(
    `efectivo teórico: $500 + $30(venta1) + $18(venta2) + $18(extra-X) + $21.50(extra+X) + $200 préstamo - $45 gasto = $${teorico.toFixed(2)}`,
  );
  const r = await call<{ corteId: string; diferencia: string }>("POST", "/t/cortes", {
    token: state.ownerToken,
    body: {
      aperturaId: state.aperturaId,
      tipo: "Z",
      observaciones: "Corte Z fin de turno demo",
      denominaciones: {
        billetes: { "500": 1, "200": 1, "100": 0, "50": 1, "20": 1, "1000": 0 },
        monedas: { "20": 0, "10": 7, "5": 0, "2": 0, "1": 2, "0.5": 1 },
      },
    },
  });
  assertOk(r, 201, "corte Z");
  const dif = Number.parseFloat(r.body.diferencia);
  const label =
    dif === 0
      ? `${c.green}cuadrada${c.reset}`
      : dif > 0
        ? `${c.yellow}sobrante${c.reset}`
        : `${c.red}faltante${c.reset}`;
  ok(`corte Z creado, diferencia ${moneyMX(r.body.diferencia)} (${label}) — caja cerrada`);
  return r.body.corteId;
}

async function ticketCorte(state: State, corteId: string): Promise<void> {
  step("GET ticket JSON del corte Z listo para Print Bridge");
  const r = await call<{
    corte: { tipo: string; numero: number; cajero: string };
    ventas: { count: number; total: string };
    efectivo: { esperado: string; contado: string; diferencia: string };
    desglosePorMetodo: Record<string, string>;
  }>("GET", `/t/cortes/${corteId}/ticket`, { token: state.ownerToken });
  assertOk(r, 200, "GET ticket corte");
  ok(`corte ${r.body.corte.tipo}#${r.body.corte.numero} por ${r.body.corte.cajero}`);
  info(`ventas: ${r.body.ventas.count} × total ${moneyMX(r.body.ventas.total)}`);
  info(
    `efectivo esperado ${moneyMX(r.body.efectivo.esperado)} vs contado ${moneyMX(r.body.efectivo.contado)} = ${moneyMX(r.body.efectivo.diferencia)}`,
  );
  info(`desglose por método: ${JSON.stringify(r.body.desglosePorMetodo)}`);
}

async function ventaPostZBloqueada(state: State): Promise<void> {
  step("Verifica que tras Z las ventas quedan bloqueadas hasta nueva apertura");
  const r = await call("POST", "/t/ventas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      lineas: [{ varianteId: state.varCoca, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "20" }],
    },
  });
  assertOk(r, 409, "venta post-Z debe bloquearse");
  ok(`venta rechazada con 409 como esperado: ${(r.body as { message: string }).message}`);
}

async function main(): Promise<void> {
  console.log(
    `${c.bold}${c.magenta}\nGaesSoft POS — Demo Cajero Retail end-to-end (Hito 1.7)${c.reset}`,
  );
  console.log(`${c.dim}API: ${API_URL} · Tenant: ${TENANT_SLUG}${c.reset}`);
  await checkApiUp();

  const state = {} as State;
  await setupTenant(state);
  await localizarSucursalYCaja(state);
  await configurarCfdi(state);
  await crearCatalogo(state);
  await abrirCaja(state);
  await buscarBarcode(state);
  const ventaPrincipalId = await previewYCobrar(state);
  await emitirCfdi(state, ventaPrincipalId);
  await ticketVenta(state, ventaPrincipalId);
  await movimientosCaja(state);
  await ventaExtra(state, state.varSabritas, "18", "Sabritas pre-X");
  await corteX(state);
  await ventaExtra(state, state.varGalletas, "21.5", "Galletas post-X");
  const corteZId = await corteZ(state);
  await ticketCorte(state, corteZId);
  await ventaPostZBloqueada(state);

  console.log(`\n${c.bold}${c.green}━━━ Demo completada exitosamente${c.reset}`);
  console.log(
    `${c.dim}Tenant queda en BD: ${TENANT_SLUG} (inspecciona con pnpm db:studio)${c.reset}\n`,
  );
}

main().catch((err) => {
  console.error(`\n${c.red}✗ Demo abortada: ${(err as Error).message}${c.reset}`);
  console.error(err);
  process.exit(1);
});
