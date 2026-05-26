/**
 * Demo end-to-end Hito 3.5 — Despacho contable + Programa Partners
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000).
 * La auto-categorización IA usa MockAiProvider automáticamente si no hay ANTHROPIC_API_KEY.
 *
 * DESPACHO (tenant):
 *   1. Tenant despacho + dueño + contador
 *   2. Contador sube CFDI XML de proveedor (combustible)
 *   3. Auto-categorización IA → cuenta contable G-606
 *   4. OC a proveedor → recepción vincula el CFDI
 *   5. DIOT export TXT formato SAT del periodo
 *
 * PARTNERS (master):
 *   6. Crear partner contador + link de referido
 *   7. Registrar click (cookie attribution 90d)
 *   8. Referral paying (setup) → recalcular comisión 25% → aprobar → payout
 *
 * Uso:  pnpm --filter @gaespos/api demo:despacho
 */

import { masterPrisma } from "@gaespos/db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const TENANT_SLUG = `demo-despacho-${Date.now().toString(36)}`;
const OWNER_EMAIL = `owner-${TENANT_SLUG}@demo.local`;
const OWNER_PASSWORD = "Owner!2026";
const CONTADOR_EMAIL = `contador-${TENANT_SLUG}@demo.local`;
const CONTADOR_PASSWORD = "Contador!2026";
const PARTNER_CODE = `demo-pt-${Date.now().toString(36)}`;

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

function sampleCfdiXml(uuid: string): string {
  const total = 1160;
  const subtotal = (total / 1.16).toFixed(4);
  const iva = (total - Number(subtotal)).toFixed(4);
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="500" Fecha="2026-05-10T12:00:00" SubTotal="${subtotal}" Moneda="MXN" TipoCambio="1" Total="${total}" TipoDeComprobante="I" MetodoPago="PUE" FormaPago="01" LugarExpedicion="44100">
  <cfdi:Emisor Rfc="GAS800101AAA" Nombre="Gas Express SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="DESPACHO DEMO" UsoCFDI="G03" DomicilioFiscalReceptor="44100" RegimenFiscalReceptor="612"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="15101500" Cantidad="1" ClaveUnidad="LTR" Descripcion="Gasolina Magna" ValorUnitario="${subtotal}" Importe="${subtotal}" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados>
        <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
      </cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}"><cfdi:Traslados>
    <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
  </cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-05-10T12:01:00" SelloCFD="X" NoCertificadoSAT="X" SelloSAT="X"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

interface State {
  adminToken: string;
  ownerToken: string;
  contadorToken: string;
  sucursalId: string;
  cfdiId: string;
}

async function setupDespacho(state: State): Promise<void> {
  step("Login admin + tenant despacho + dueño + contador");
  state.adminToken = await loginAdmin();
  const t = await call("POST", "/tenants", {
    token: state.adminToken,
    body: { slug: TENANT_SLUG, name: "Despacho Contable Demo", planCode: "growth" },
  });
  assertOk(t, 201, "POST tenant");
  await call("POST", `/tenants/${TENANT_SLUG}/bootstrap-owner`, {
    token: state.adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dueño Despacho" },
  });
  state.ownerToken = await loginTenant(OWNER_EMAIL, OWNER_PASSWORD);
  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: state.ownerToken,
  });
  const contadorRol = roles.body.find((r) => r.codigo === "contador_interno");
  await call("POST", "/t/usuarios", {
    token: state.ownerToken,
    body: {
      email: CONTADOR_EMAIL,
      password: CONTADOR_PASSWORD,
      nombre: "Contador",
      rolIds: [contadorRol?.id],
    },
  });
  state.contadorToken = await loginTenant(CONTADOR_EMAIL, CONTADOR_PASSWORD);
  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", {
    token: state.ownerToken,
  });
  state.sucursalId = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";
  ok(`tenant ${TENANT_SLUG} + dueño + contador (seed: 30 categorías contables MX)`);
}

async function flujoCfdiRecibido(state: State): Promise<void> {
  step("Contador sube CFDI XML de proveedor (combustible $1,160)");
  const uuid = `demo-${Date.now().toString(16)}-cfdi`;
  const up = await call<{ cfdiRecibidoId: string; emisorRazonSocial: string; total: string }>(
    "POST",
    "/t/cfdis-recibidos/upload",
    { token: state.contadorToken, body: { xml: sampleCfdiXml(uuid) } },
  );
  assertOk(up, 201, "upload CFDI");
  state.cfdiId = up.body.cfdiRecibidoId;
  ok(
    `CFDI parseado: ${up.body.emisorRazonSocial}, total ${moneyMX(up.body.total)} (UUID, IVA extraído)`,
  );

  step("Auto-categorización IA → cuenta contable");
  const cat = await call<{
    categoriaContableId: string;
    categorizadoPor: string;
    confianza: number | null;
  }>("POST", `/t/cfdis-recibidos/${state.cfdiId}/auto-categorizar`, { token: state.contadorToken });
  assertOk(cat, 200, "auto-categorizar");
  const det = await call<{
    categorizacion: { categoria: { codigoContable: string; nombre: string } };
  }>("GET", `/t/cfdis-recibidos/${state.cfdiId}`, { token: state.contadorToken });
  const cc = det.body.categorizacion.categoria;
  ok(
    `categorizado por ${cat.body.categorizadoPor} (confianza ${cat.body.confianza}) → ${cc.codigoContable} "${cc.nombre}"`,
  );
}

async function flujoOrdenCompra(state: State): Promise<void> {
  step("Contador crea orden de compra a proveedor");
  const oc = await call<{ id: string; folio: string }>("POST", "/t/ordenes-compra", {
    token: state.ownerToken,
    body: {
      sucursalId: state.sucursalId,
      proveedorRfc: "GAS800101AAA",
      proveedorRazonSocial: "Gas Express SA de CV",
      lineas: [
        { descripcion: "Gasolina Magna (1000 L)", cantidad: 1000, precioUnitario: 1, ivaPct: 16 },
      ],
    },
  });
  assertOk(oc, 201, "crear OC");
  ok(`OC ${oc.body.folio} creada en borrador`);
  await call("POST", `/t/ordenes-compra/${oc.body.id}/autorizar`, {
    token: state.contadorToken,
    body: {},
  });
  info("OC autorizada → enviada al proveedor");
  const recibir = await call<{ estado: string }>(
    "POST",
    `/t/ordenes-compra/${oc.body.id}/recibir`,
    {
      token: state.ownerToken,
      body: {
        cfdiRecibidoId: state.cfdiId,
        lineas: [
          {
            lineaId: (
              await call<{ lineas: Array<{ id: string }> }>(
                "GET",
                `/t/ordenes-compra/${oc.body.id}`,
                {
                  token: state.ownerToken,
                },
              )
            ).body.lineas[0]?.id,
            cantidadRecibida: 1000,
          },
        ],
      },
    },
  );
  assertOk(recibir, 200, "recibir OC");
  ok(`OC recibida (estado=${recibir.body.estado}) + CFDI del proveedor vinculado`);
}

async function flujoDiot(state: State): Promise<void> {
  step("Contador genera DIOT del periodo (operaciones con terceros)");
  const reporte = await call<{
    periodoYyyymm: string;
    totalProveedores: number;
    totalIvaPagado: string;
  }>("GET", "/t/diot/202605", { token: state.contadorToken });
  assertOk(reporte, 200, "generar DIOT");
  ok(
    `DIOT ${reporte.body.periodoYyyymm}: ${reporte.body.totalProveedores} proveedor(es), IVA acreditable ${moneyMX(reporte.body.totalIvaPagado)}`,
  );

  const txtRes = await fetch(`${API_URL}/t/diot/202605/export.txt`, {
    headers: { Authorization: `Bearer ${state.contadorToken}` },
  });
  if (txtRes.status !== 200) {
    console.error(`${c.red}✗ export DIOT TXT: status ${txtRes.status}${c.reset}`);
    process.exit(1);
  }
  const txt = await txtRes.text();
  const primeraLinea = txt.split("\n")[0] ?? "";
  ok("archivo TXT formato SAT (separado por |) listo para subir al portal SAT:");
  info(primeraLinea);
}

async function flujoPartners(state: State): Promise<void> {
  step("Crear partner contador (programa de referidos)");
  const partner = await call<{ id: string; nivel: string }>("POST", "/partners", {
    token: state.adminToken,
    body: {
      codigo: PARTNER_CODE,
      razonSocial: "Despacho Aliado SC",
      emailContacto: `${PARTNER_CODE}@aliado.mx`,
      tipo: "contador",
      ciudad: "Monterrey",
    },
  });
  assertOk(partner, 201, "crear partner");
  const partnerId = partner.body.id;
  ok(`partner ${PARTNER_CODE} creado (nivel ${partner.body.nivel} = comisión 25% lifetime)`);

  step("Crear link de referido + registrar click (cookie attribution 90d)");
  const linkSlug = `ref-${Date.now().toString(36)}`;
  await call("POST", `/partners/${partnerId}/links`, {
    token: state.adminToken,
    body: { slug: linkSlug, nombre: "Campaña LinkedIn", utmSource: "linkedin" },
  });
  const click = await call<{ cookieValue: string; expiresAt: string }>(
    "POST",
    `/p/${linkSlug}/click`,
    {},
  );
  assertOk(click, 200, "registrar click");
  const dias = Math.round((new Date(click.body.expiresAt).getTime() - Date.now()) / 86_400_000);
  ok(`link ${linkSlug} → click registrado, cookie attribution válida ${dias} días`);

  step("Setup: referral convierte a 'paying' (tenant activo de pago)");
  const starterPlan = await masterPrisma.plan.findUnique({ where: { code: "starter" } });
  if (!starterPlan) throw new Error("plan starter no sembrado");
  const refTenant = await masterPrisma.tenant.create({
    data: {
      slug: `${TENANT_SLUG}-ref`,
      name: "Cliente referido por partner",
      schemaName: `tenant_${PARTNER_CODE.replace(/-/g, "_")}_ref`,
      status: "active",
      planId: starterPlan.id,
    },
  });
  const refer = await masterPrisma.referral.findFirst({
    where: { partnerId, cookieValue: click.body.cookieValue },
  });
  if (!refer) throw new Error("referral no encontrado");
  await masterPrisma.referral.update({
    where: { id: refer.id },
    data: { tenantId: refTenant.id, estado: "paying", paidStartAt: new Date() },
  });
  info(
    `referral asociado a tenant '${refTenant.slug}' (plan ${starterPlan.code} ${moneyMX(starterPlan.priceCents / 100)}/mes)`,
  );

  step("Recalcular comisión del periodo → aprobar → generar payout");
  const recalc = await call<{ creadas: number; totalMontoComision: string }>(
    "POST",
    `/partners/${partnerId}/recalcular-comisiones`,
    { token: state.adminToken, body: { periodoYyyymm: "202605" } },
  );
  assertOk(recalc, 200, "recalcular comisiones");
  ok(
    `comisión calculada: ${recalc.body.creadas} comisión(es), total ${moneyMX(recalc.body.totalMontoComision)} (25% de la suscripción)`,
  );

  const comms = await call<Array<{ id: string; estado: string }>>(
    "GET",
    `/partners/commissions/all?partnerId=${partnerId}`,
    { token: state.adminToken },
  );
  const commId = comms.body[0]?.id;
  if (!commId) throw new Error("sin comisión");
  await call("POST", `/partners/commissions/${commId}/aprobar`, {
    token: state.adminToken,
    body: {},
  });
  info("comisión aprobada");

  const payout = await call<{ commissionsAgrupadas: number; montoTotal: string }>(
    "POST",
    "/partners/payouts",
    { token: state.adminToken, body: { partnerId, periodoYyyymm: "202605", metodoPago: "spei" } },
  );
  assertOk(payout, 201, "crear payout");
  ok(
    `payout generado: ${payout.body.commissionsAgrupadas} comisión(es) → ${moneyMX(payout.body.montoTotal)} a pagar al partner vía SPEI`,
  );

  // limpieza del tenant de referral creado para el demo
  await masterPrisma.tenant.delete({ where: { id: refTenant.id } }).catch(() => {});
}

async function main(): Promise<void> {
  console.log(`${c.bold}${c.magenta}🧾 Demo Despacho Contable + Programa Partners${c.reset}`);
  console.log(`${c.dim}API: ${API_URL} · tenant: ${TENANT_SLUG}${c.reset}`);
  const state = {} as State;
  await setupDespacho(state);
  await flujoCfdiRecibido(state);
  await flujoOrdenCompra(state);
  await flujoDiot(state);
  await flujoPartners(state);
  await masterPrisma.$disconnect();
  console.log(
    `\n${c.bold}${c.green}✅ Demo despacho + partners completo — todos los pasos verdes${c.reset}\n`,
  );
}

main().catch(async (err) => {
  await masterPrisma.$disconnect().catch(() => {});
  console.error(
    `\n${c.red}✗ Demo falló: ${err instanceof Error ? err.message : String(err)}${c.reset}`,
  );
  process.exit(1);
});
