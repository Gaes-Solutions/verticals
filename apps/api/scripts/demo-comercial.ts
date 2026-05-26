/**
 * Demo end-to-end Hito 2 — Flujos comerciales completos
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000):
 *
 *  1. Setup: admin → tenant → owner + cajero + vendedor + almacen
 *  2. CFDI sandbox + catálogo (3 productos con stock 200 c/u)
 *  3. Cliente B2C con fiado autorizado + Cliente B2B con línea de crédito $50,000
 *  4. Cajero abre caja con fondo $1,000
 *  5. **Apartado**: cliente B2C aparta 5 piezas con abono inicial → abona resto → liquida
 *  6. **Fiado**: venta B2C pagada con `credito_fiado` → saldo informal sube
 *  7. **Regularización fiado→CxC**: gerente convierte $1,000 del fiado a CxC formal
 *  8. **Cotización B2B**: vendedor cotiza 30 pzs al cliente B2B → envía por email → cliente acepta
 *  9. **Pedido**: vendedor convierte a pedido → owner aprueba (pasa umbral $5K) → almacen prepara → marca enviado con tracking Estafeta → marca entregado
 * 10. **Convertir pedido a venta credito_b2b** → crea CxC automática contra la línea
 * 11. **Devolución parcial** sobre la venta del pedido con `nota_credito_cxc` → abona a la CxC asociada
 * 12. **Pago CxC**: cajero registra abono efectivo a la CxC restante → marca liquidada cuando saldo=0
 *
 * Uso:
 *   pnpm --filter @gaespos/api demo:comercial
 *
 * Variables entorno opcionales:
 *   API_URL              (default http://localhost:3000)
 *   SEED_ADMIN_EMAIL     (default admin@gaessoft.local)
 *   SEED_ADMIN_PASSWORD  (default ChangeMe!2026)
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const TENANT_SLUG = `demoq-${Date.now().toString(36)}`;
const OWNER_EMAIL = `owner-${TENANT_SLUG}@demo.local`;
const OWNER_PASSWORD = "Owner!2026";
const CAJERO_EMAIL = `cajero-${TENANT_SLUG}@demo.local`;
const CAJERO_PASSWORD = "Cajero!2026";
const VENDOR_EMAIL = `vendedor-${TENANT_SLUG}@demo.local`;
const VENDOR_PASSWORD = "Vendedor!2026";
const ALMACEN_EMAIL = `almacen-${TENANT_SLUG}@demo.local`;
const ALMACEN_PASSWORD = "Almacen!2026";

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
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
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
  vendedorToken: string;
  almacenToken: string;
  sucursalId: string;
  cajaId: string;
  varCemento: string;
  varTubo: string;
  varGrava: string;
  clienteB2cId: string;
  clienteB2bId: string;
  apartadoId: string;
  cxcFiadoId: string;
  cotizacionId: string;
  pedidoId: string;
  ventaPedidoId: string;
  cxcPedidoId: string;
}

async function loginTenant(email: string, password: string): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/tenant/login", {
    body: { tenantSlug: TENANT_SLUG, email, password },
  });
  assertOk(r, 200, `tenant login ${email}`);
  return r.body.accessToken;
}

async function setupTenantYUsuarios(state: State): Promise<void> {
  step("Login admin + crea tenant fresh");
  const admin = await call<{ accessToken: string }>("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertOk(admin, 200, "login admin");
  state.adminToken = admin.body.accessToken;
  ok(`admin ${ADMIN_EMAIL} autenticado`);

  const t = await call("POST", "/tenants", {
    token: state.adminToken,
    body: { slug: TENANT_SLUG, name: `Mayorista ${TENANT_SLUG}`, planCode: "starter" },
  });
  assertOk(t, 201, "POST tenant");
  ok(`tenant ${TENANT_SLUG} creado`);

  step("Bootstrap dueño + crea cajero/vendedor/almacen");
  await call("POST", `/tenants/${TENANT_SLUG}/bootstrap-owner`, {
    token: state.adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dueño Mayorista" },
  });
  state.ownerToken = await loginTenant(OWNER_EMAIL, OWNER_PASSWORD);

  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: state.ownerToken,
  });
  const rolByCodigo = (codigo: string): string => {
    const r = roles.body.find((x) => x.codigo === codigo);
    if (!r) throw new Error(`rol preset "${codigo}" no encontrado`);
    return r.id;
  };

  for (const user of [
    { email: CAJERO_EMAIL, password: CAJERO_PASSWORD, rolCodigo: "cajero", nombre: "Cajero" },
    { email: VENDOR_EMAIL, password: VENDOR_PASSWORD, rolCodigo: "vendedor", nombre: "Vendedor" },
    {
      email: ALMACEN_EMAIL,
      password: ALMACEN_PASSWORD,
      rolCodigo: "almacen",
      nombre: "Almacenista",
    },
  ]) {
    const u = await call("POST", "/t/usuarios", {
      token: state.ownerToken,
      body: {
        email: user.email,
        password: user.password,
        nombre: user.nombre,
        rolIds: [rolByCodigo(user.rolCodigo)],
      },
    });
    assertOk(u, 201, `crear ${user.rolCodigo}`);
  }
  state.cajeroToken = await loginTenant(CAJERO_EMAIL, CAJERO_PASSWORD);
  state.vendedorToken = await loginTenant(VENDOR_EMAIL, VENDOR_PASSWORD);
  state.almacenToken = await loginTenant(ALMACEN_EMAIL, ALMACEN_PASSWORD);
  ok("4 usuarios creados (dueño/cajero/vendedor/almacen)");
}

async function configurarCfdi(state: State): Promise<void> {
  step("Configura CFDI sandbox");
  const r = await call("PUT", "/t/cfdis/config", {
    token: state.ownerToken,
    body: {
      rfcEmisor: "BBB010101BB1",
      razonSocialEmisor: "Mayorista Demo SA de CV",
      regimenFiscalSat: "601",
      codigoPostalEmisor: "44100",
      lugarExpedicion: "44100",
      facturamaApiKey: "demo-sandbox-key-1234567890",
      facturamaAmbiente: "sandbox",
    },
  });
  if (r.status !== 200 && r.status !== 201) assertOk(r, 201, "PUT cfdi config");
  ok("CFDI sandbox configurado (Mayorista Demo SA, régimen 601)");
}

async function localizarSucursal(state: State): Promise<void> {
  step("Localiza sucursal + caja seed");
  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", {
    token: state.ownerToken,
  });
  const suc = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL");
  if (!suc) throw new Error("sucursal");
  state.sucursalId = suc.id;
  const cajas = await call<Array<{ id: string; codigo: string }>>("GET", "/t/cajas", {
    token: state.ownerToken,
  });
  const caja = cajas.body.find((c) => c.codigo === "CAJA-1");
  if (!caja) throw new Error("caja");
  state.cajaId = caja.id;
  ok("sucursal SUC-PRINCIPAL + caja CAJA-1 localizadas");
}

async function crearProducto(
  state: State,
  sku: string,
  nombre: string,
  precio: string,
): Promise<string> {
  const r = await call<{ variantes: Array<{ id: string }> }>("POST", "/t/productos", {
    token: state.ownerToken,
    body: {
      skuPadre: sku,
      nombre,
      precioBase: precio,
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
      cantidad: "200",
      motivo: "Stock inicial demo comercial",
    },
  });
  return varianteId;
}

async function crearCatalogo(state: State): Promise<void> {
  step("Crea 3 productos de obra con stock 200 c/u (precios con IVA 16% incluido)");
  state.varCemento = await crearProducto(state, "CEM-50", "Cemento gris 50kg", "232");
  ok(`Cemento 50kg @ ${moneyMX("232.00")}`);
  state.varTubo = await crearProducto(state, "TUB-PVC4", 'Tubo PVC 4" 6m', "464");
  ok(`Tubo PVC 4" @ ${moneyMX("464.00")}`);
  state.varGrava = await crearProducto(state, "GRA-M3", "Grava 3/4 m³", "696");
  ok(`Grava m³ @ ${moneyMX("696.00")}`);
}

async function crearClientes(state: State): Promise<void> {
  step("Crea cliente B2C con fiado $10,000 y cliente B2B con línea $50,000");
  const b2c = await call<{ id: string }>("POST", "/t/clientes", {
    token: state.ownerToken,
    body: {
      nombre: "Juan",
      apellidos: "Pérez Constructor",
      telefonoPrincipal: "3311112222",
      permiteFiado: true,
      limiteFiado: "10000",
    },
  });
  assertOk(b2c, 201, "cliente B2C");
  state.clienteB2cId = b2c.body.id;
  ok(`B2C Juan Pérez (fiado autorizado hasta ${moneyMX("10000")})`);

  const b2b = await call<{ id: string }>("POST", "/t/clientes-b2b", {
    token: state.ownerToken,
    body: {
      razonSocial: "Construcciones del Bajío SA de CV",
      nombreComercial: "ConstruBajío",
      rfc: "CBJ900101AB1",
      regimenFiscalSat: "601",
      usoCfdiDefault: "G03",
      codigoPostalFiscal: "44100",
      emailPrincipal: "compras@construbajio.com",
      telefonoPrincipal: "3344445555",
      industria: "construccion",
      condicionesPago: "credito",
      diasCreditoDefault: 30,
      requiereAprobacionInterna: true,
      montoAprobacionRequired: "5000",
    },
  });
  assertOk(b2b, 201, "cliente B2B");
  state.clienteB2bId = b2b.body.id;

  await call("POST", `/t/clientes-b2b/${state.clienteB2bId}/credito`, {
    token: state.ownerToken,
    body: {
      lineaAutorizada: "50000",
      diasCredito: 30,
      tasaInteresMoraPct: 2.5,
      notasAutorizacion: "Cliente fiel histórico",
    },
  });
  ok(
    `B2B ConstruBajío con línea ${moneyMX("50000")} a 30 días, aprobación umbral ${moneyMX("5000")}`,
  );
}

async function abrirCaja(state: State): Promise<void> {
  step("Cajero abre caja con $1,000 de fondo");
  const r = await call("POST", `/t/cajas/${state.cajaId}/aperturar`, {
    token: state.cajeroToken,
    body: { montoInicial: "1000" },
  });
  assertOk(r, 201, "apertura caja");
  ok("caja abierta con fondo $1,000");
}

async function flujoApartado(state: State): Promise<void> {
  step("Apartado: cliente aparta 5 cementos con abono inicial $500");
  const ap = await call<{
    apartadoId: string;
    folio: string;
    total: string;
    saldoRestante: string;
  }>("POST", "/t/apartados", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      clienteId: state.clienteB2cId,
      diasVigencia: 15,
      penaCancelacionPct: 20,
      lineas: [{ varianteId: state.varCemento, cantidad: "5" }],
      abonoInicial: { monto: "500", metodo: "efectivo" },
    },
  });
  assertOk(ap, 201, "apartado");
  state.apartadoId = ap.body.apartadoId;
  ok(
    `apartado ${ap.body.folio} total ${moneyMX(ap.body.total)}, saldo ${moneyMX(ap.body.saldoRestante)}`,
  );
  info("stock real intacto, stockReservado +5 (reserva sin venta aún)");

  step("Cliente abona el resto en 2 visitas y se liquida");
  await call("POST", `/t/apartados/${state.apartadoId}/abonos`, {
    token: state.cajeroToken,
    body: { monto: "400", metodo: "efectivo" },
  });
  ok(`abono +${moneyMX("400")}`);
  await call("POST", `/t/apartados/${state.apartadoId}/abonos`, {
    token: state.cajeroToken,
    body: { monto: "260", metodo: "tarjeta_debito" },
  });
  ok(`abono +${moneyMX("260")} (saldo=0)`);
  const liq = await call<{ folio: string; totalCobrado: string }>(
    "POST",
    `/t/apartados/${state.apartadoId}/liquidar`,
    { token: state.cajeroToken },
  );
  assertOk(liq, 201, "liquidar apartado");
  ok(
    `apartado liquidado → venta ${liq.body.folio} por ${moneyMX(liq.body.totalCobrado)} (reserva liberada + stockActual −5)`,
  );
}

async function flujoFiadoYRegularizar(state: State): Promise<void> {
  step("Venta a fiado: Juan compra 3 tubos pagando con credito_fiado");
  const v = await call("POST", "/t/ventas", {
    token: state.cajeroToken,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      clienteId: state.clienteB2cId,
      lineas: [{ varianteId: state.varTubo, cantidad: "3" }],
      pagos: [{ metodo: "credito_fiado", monto: "1392" }],
    },
  });
  assertOk(v, 201, "venta fiado");
  ok(`venta a fiado ${moneyMX("1392")} (3× tubos PVC) — saldo informal sube`);

  const fiado = await call<{ usado: string; disponible: string }>(
    "GET",
    `/t/clientes/${state.clienteB2cId}/fiado`,
    { token: state.ownerToken },
  );
  info(
    `saldo fiado del cliente: ${moneyMX(fiado.body.usado)} / disponible ${moneyMX(fiado.body.disponible)}`,
  );

  step("Regulariza $1,000 del fiado a CxC formal (cliente firma documento)");
  const r = await call<{
    saldoFiadoRestante: string;
    cxc: { cuentaCobrarId: string; folio: string };
  }>("POST", "/t/cxc/regularizar-fiado", {
    token: state.ownerToken,
    body: {
      clienteId: state.clienteB2cId,
      sucursalId: state.sucursalId,
      monto: "1000",
      diasCreditoOtorgados: 30,
      tasaInteresMoraPct: 2,
      motivo: "Formalización con pagaré firmado",
    },
  });
  assertOk(r, 201, "regularizar fiado");
  state.cxcFiadoId = r.body.cxc.cuentaCobrarId;
  ok(
    `CxC formal ${r.body.cxc.folio} por ${moneyMX("1000")} creada; fiado restante ${moneyMX(r.body.saldoFiadoRestante)}`,
  );
}

async function flujoCotizacion(state: State): Promise<void> {
  step("Vendedor cotiza 30 cementos para ConstruBajío");
  const c1 = await call<{ cotizacionId: string; folio: string; total: string }>(
    "POST",
    "/t/cotizaciones",
    {
      token: state.vendedorToken,
      body: {
        sucursalId: state.sucursalId,
        clienteB2bId: state.clienteB2bId,
        diasVigencia: 15,
        condicionesPago: "30 días neto",
        lineas: [{ varianteId: state.varCemento, cantidad: "30" }],
      },
    },
  );
  assertOk(c1, 201, "cotización");
  state.cotizacionId = c1.body.cotizacionId;
  ok(`cotización ${c1.body.folio} total ${moneyMX(c1.body.total)} en estado borrador`);

  step("Vendedor envía cotización por email + cliente la acepta");
  const env = await call<{ pdfUrl: string }>(
    "POST",
    `/t/cotizaciones/${state.cotizacionId}/enviar`,
    {
      token: state.vendedorToken,
      body: { canal: "email", destino: "compras@construbajio.com" },
    },
  );
  assertOk(env, 200, "enviar cot");
  ok(`enviada vía email a compras@construbajio.com (PDF placeholder ${env.body.pdfUrl})`);
  const ac = await call("POST", `/t/cotizaciones/${state.cotizacionId}/aceptar`, {
    token: state.ownerToken,
  });
  assertOk(ac, 200, "aceptar cot");
  ok("cliente aceptó (firma electrónica simulada V1) → estado=aceptada");
}

async function flujoPedidoFull(state: State): Promise<void> {
  step("Vendedor convierte cotización → pedido (con OC del cliente)");
  const p = await call<{ pedidoId: string; folio: string; estadoAprobacion: string }>(
    "POST",
    `/t/cotizaciones/${state.cotizacionId}/convertir-pedido`,
    {
      token: state.vendedorToken,
      body: { ordenCompraCliente: "OC-CB-2026-0042" },
    },
  );
  assertOk(p, 201, "convertir-pedido");
  state.pedidoId = p.body.pedidoId;
  ok(`pedido ${p.body.folio} creado, estadoAprobacion=${p.body.estadoAprobacion} (>umbral $5K)`);

  step("Almacenista intenta preparar pedido pendiente de aprobación → 409 hasta aprobar");
  const intento = await call("POST", `/t/pedidos/${state.pedidoId}/preparar`, {
    token: state.almacenToken,
  });
  if (intento.status === 409) {
    info(`almacen bloqueado: ${(intento.body as { message: string }).message}`);
  } else {
    assertOk(intento, 409, "preparar bloqueado");
  }

  step("Dueño aprueba el pedido");
  const ap = await call<{ estadoAprobacion: string }>(
    "POST",
    `/t/pedidos/${state.pedidoId}/aprobar`,
    { token: state.ownerToken },
  );
  assertOk(ap, 200, "aprobar pedido");
  ok(`pedido aprobado por dueño → estadoAprobacion=${ap.body.estadoAprobacion}`);

  step("Almacén prepara → marca enviado con tracking Estafeta → marca entregado");
  await call("POST", `/t/pedidos/${state.pedidoId}/preparar`, { token: state.almacenToken });
  ok("estado=preparando (almacén separó la mercancía)");
  await call("POST", `/t/pedidos/${state.pedidoId}/marcar-enviado`, {
    token: state.almacenToken,
    body: {
      paqueteria: "Estafeta",
      trackingExterno: "EST-987654321",
      trackingUrl: "https://estafeta.mx/track/EST-987654321",
    },
  });
  ok("estado=enviado (Estafeta guía EST-987654321)");
  await call("POST", `/t/pedidos/${state.pedidoId}/marcar-entregado`, {
    token: state.almacenToken,
  });
  ok("estado=entregado (cliente firmó la guía)");

  step("Cajero convierte pedido entregado → venta credito_b2b (crea CxC automática)");
  const lineaBefore = await call<{ disponible: string; saldoCxcAbiertas: string }>(
    "GET",
    `/t/cxc/linea-credito?clienteB2bId=${state.clienteB2bId}`,
    { token: state.ownerToken },
  );
  info(
    `línea B2B ANTES: disponible ${moneyMX(lineaBefore.body.disponible)}, abiertas ${moneyMX(lineaBefore.body.saldoCxcAbiertas)}`,
  );

  const cv = await call<{ ventaId: string; folioVenta: string; total: string }>(
    "POST",
    `/t/pedidos/${state.pedidoId}/convertir-venta`,
    {
      token: state.cajeroToken,
      body: {
        cajaId: state.cajaId,
        pagos: [{ metodo: "credito_b2b", monto: "6960" }],
      },
    },
  );
  assertOk(cv, 201, "convertir venta");
  state.ventaPedidoId = cv.body.ventaId;
  ok(
    `venta ${cv.body.folioVenta} total ${moneyMX(cv.body.total)} canal=mayoreo + stock −30 + CxC automática`,
  );

  const lineaAfter = await call<{ disponible: string; saldoCxcAbiertas: string }>(
    "GET",
    `/t/cxc/linea-credito?clienteB2bId=${state.clienteB2bId}`,
    { token: state.ownerToken },
  );
  info(
    `línea B2B DESPUÉS: disponible ${moneyMX(lineaAfter.body.disponible)}, abiertas ${moneyMX(lineaAfter.body.saldoCxcAbiertas)}`,
  );

  const cxcs = await call<{ items: Array<{ id: string; folio: string; ventaId: string }> }>(
    "GET",
    `/t/cxc?clienteB2bId=${state.clienteB2bId}&tipoOrigen=venta_credito`,
    { token: state.ownerToken },
  );
  const cxcAuto = cxcs.body.items.find((x) => x.ventaId === cv.body.ventaId);
  if (!cxcAuto) throw new Error("CxC automática no creada");
  state.cxcPedidoId = cxcAuto.id;
  ok(`CxC ${cxcAuto.folio} enlazada a la venta`);
}

async function flujoDevolucionConNotaCredito(state: State): Promise<void> {
  step("Cliente devuelve 5 cementos defectuosos → reembolso vía nota_credito_cxc");
  const ventaDetalle = await call<{ lineas: Array<{ id: string; cantidad: string }> }>(
    "GET",
    `/t/ventas/${state.ventaPedidoId}`,
    { token: state.ownerToken },
  );
  const linea = ventaDetalle.body.lineas[0];
  if (!linea) throw new Error("línea de venta missing");

  const cxcBefore = await call<{ montoPagado: string }>("GET", `/t/cxc/${state.cxcPedidoId}`, {
    token: state.ownerToken,
  });
  info(`CxC antes: montoPagado ${moneyMX(cxcBefore.body.montoPagado)}`);

  const dv = await call<{ folio: string; totalDevuelto: string }>(
    "POST",
    `/t/ventas/${state.ventaPedidoId}/devolver`,
    {
      token: state.cajeroToken,
      body: {
        motivo: "defectuoso",
        motivoDetalle: "5 sacos rotos en transporte",
        metodoReembolso: "nota_credito_cxc",
        reponeStockDefault: false,
        lineas: [{ ventaLineaId: linea.id, cantidadDevuelta: "5", motivoLinea: "defectuoso" }],
      },
    },
  );
  assertOk(dv, 201, "devolución");
  ok(
    `devolución ${dv.body.folio} por ${moneyMX(dv.body.totalDevuelto)} (no repone stock → merma net-zero)`,
  );

  const cxcAfter = await call<{ montoPagado: string; estado: string }>(
    "GET",
    `/t/cxc/${state.cxcPedidoId}`,
    { token: state.ownerToken },
  );
  info(`CxC después: montoPagado ${moneyMX(cxcAfter.body.montoPagado)} (devolución abonada)`);
}

async function flujoPagoCxcFinal(state: State): Promise<void> {
  step("Cajero registra el resto del pago de la CxC del pedido en efectivo");
  const det = await call<{ montoOriginal: string; montoPagado: string }>(
    "GET",
    `/t/cxc/${state.cxcPedidoId}`,
    { token: state.ownerToken },
  );
  const restante = Number(det.body.montoOriginal) - Number(det.body.montoPagado);
  info(`saldo restante a pagar: ${moneyMX(restante)}`);

  const r = await call<{ estado: string; saldoRestante: string }>(
    "POST",
    `/t/cxc/${state.cxcPedidoId}/pagos`,
    {
      token: state.cajeroToken,
      body: {
        monto: String(restante),
        metodo: "efectivo",
        referencia: "Pago contado ConstruBajío",
      },
    },
  );
  assertOk(r, 201, "pago CxC final");
  ok(
    `pago efectivo registrado → CxC estado=${r.body.estado}, saldo ${moneyMX(r.body.saldoRestante)}`,
  );
}

async function main(): Promise<void> {
  console.log(
    `${c.bold}${c.magenta}\nGaesSoft POS — Demo Comercial end-to-end (Hito 2.7)${c.reset}`,
  );
  console.log(`${c.dim}API: ${API_URL} · Tenant: ${TENANT_SLUG}${c.reset}`);
  await checkApiUp();

  const state = {} as State;
  await setupTenantYUsuarios(state);
  await localizarSucursal(state);
  await configurarCfdi(state);
  await crearCatalogo(state);
  await crearClientes(state);
  await abrirCaja(state);
  await flujoApartado(state);
  await flujoFiadoYRegularizar(state);
  await flujoCotizacion(state);
  await flujoPedidoFull(state);
  await flujoDevolucionConNotaCredito(state);
  await flujoPagoCxcFinal(state);

  console.log(`\n${c.bold}${c.green}━━━ Demo comercial completada exitosamente${c.reset}`);
  console.log(
    `${c.dim}Tenant queda en BD: ${TENANT_SLUG} (inspecciona con pnpm db:studio)${c.reset}\n`,
  );
}

main().catch((err) => {
  console.error(`\n${c.red}✗ Demo abortada: ${(err as Error).message}${c.reset}`);
  console.error(err);
  process.exit(1);
});

export {};
