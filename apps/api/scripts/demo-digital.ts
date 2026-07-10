/**
 * Demo end-to-end Hito 4 — Digital y marketing.
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000)
 * con adapters mock (pagos, mensajería, IA). Cubre los 4 sub-hitos:
 *
 *   ACTO 1 — Tienda online (4.1): config tienda → publicar producto →
 *            catálogo público → carrito → checkout (pago mock) → pedido→venta.
 *   ACTO 2 — Marketing (4.2): promo automática en venta POS + lealtad
 *            (inscribir/acumular/canjear) + campaña WhatsApp (segmento→worker).
 *   ACTO 3 — Marketplace (4.3): perfil médico → admin valida cédula → publica →
 *            búsqueda pública → reseña verificada de paciente.
 *   ACTO 4 — Portal paciente PHR (4.4): login OTP sin contraseña → la clínica
 *            registra consent y publica un registro → expediente unificado
 *            cross-tenant → QR de emergencia → export ARCO.
 *
 * Uso:  pnpm --filter @gaespos/api demo:digital
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const SUFFIX = Date.now().toString(36);
const RETAIL_SLUG = `demo-tienda-${SUFFIX}`;
const CLINIC_SLUG = `demo-clinica-${SUFFIX}`;
const PATIENT_PHONE = `+52155${String(Date.now()).slice(-8)}`;

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
function act(title: string): void {
  stepNum = 0;
  console.log(`\n${c.bold}${c.magenta}═══════════ ${title} ═══════════${c.reset}`);
}
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
function assertOk(r: ApiResult, expected: number | number[], ctx: string): void {
  const exp = Array.isArray(expected) ? expected : [expected];
  if (!exp.includes(r.status)) {
    console.error(`\n${c.red}✗ ${ctx}: esperaba ${exp.join("|")}, recibió ${r.status}${c.reset}`);
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
async function loginTenant(slug: string, email: string, password: string): Promise<string> {
  const r = await call<{ accessToken: string }>("POST", "/auth/tenant/login", {
    body: { tenantSlug: slug, email, password },
  });
  assertOk(r, 200, `tenant login ${email}`);
  return r.body.accessToken;
}
async function provisionTenant(
  adminToken: string,
  slug: string,
  name: string,
  ownerEmail: string,
  ownerPassword: string,
): Promise<string> {
  const t = await call("POST", "/tenants", {
    token: adminToken,
    body: { slug, name, planCode: "growth" },
  });
  assertOk(t, 201, `POST tenant ${slug}`);
  const bo = await call("POST", `/tenants/${slug}/bootstrap-owner`, {
    token: adminToken,
    body: { email: ownerEmail, password: ownerPassword, nombre: "Dueño Demo" },
  });
  assertOk(bo, [200, 201], "bootstrap-owner");
  return loginTenant(slug, ownerEmail, ownerPassword);
}

// ─────────────────────────────────────────────────────────────────────────────

interface RetailState {
  ownerToken: string;
  sucursalId: string;
  cajaId: string;
  varianteId: string;
  productoId: string;
  clienteId: string;
}

async function actoTienda(adminToken: string, state: RetailState): Promise<void> {
  act("ACTO 1 — Tienda online (Ecommerce 4.1)");

  step("Provisionar tenant retail + producto con stock");
  state.ownerToken = await provisionTenant(
    adminToken,
    RETAIL_SLUG,
    "Tienda GaesSoft Demo",
    `owner-${RETAIL_SLUG}@demo.local`,
    "Owner!2026",
  );
  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", {
    token: state.ownerToken,
  });
  state.sucursalId = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";
  const cajas = await call<Array<{ id: string }>>("GET", "/t/cajas", { token: state.ownerToken });
  state.cajaId = cajas.body[0]?.id ?? "";
  const cat = await call<{ id: string }>("POST", "/t/categorias", {
    token: state.ownerToken,
    body: { nombre: "Playeras", codigo: "PLY" },
  });
  const prod = await call<{ id: string; variantes: Array<{ id: string }> }>(
    "POST",
    "/t/productos",
    {
      token: state.ownerToken,
      body: {
        skuPadre: "PLY-001",
        nombre: "Playera GaesSoft",
        categoriaId: cat.body.id,
        precioBase: "299.00",
        aplicaIva: true,
        tasaIva: "16",
      },
    },
  );
  assertOk(prod, 201, "crear producto");
  state.productoId = prod.body.id;
  state.varianteId = prod.body.variantes[0]?.id ?? "";
  await call("POST", "/t/inventario/ajustes", {
    token: state.ownerToken,
    body: {
      varianteId: state.varianteId,
      sucursalId: state.sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "Inicial",
    },
  });
  ok(`tenant ${RETAIL_SLUG} · producto "Playera GaesSoft" @ ${moneyMX(299)} · 100 en stock`);

  step("Configurar tienda y publicar el producto");
  await call("PUT", "/t/ecommerce/config", {
    token: state.ownerToken,
    body: { subdominio: RETAIL_SLUG, nombre: "Mi Tienda Demo", activa: true },
  });
  const pub = await call<{ id: string }>("POST", "/t/ecommerce/productos-publicados", {
    token: state.ownerToken,
    body: {
      productoId: state.productoId,
      tituloPublico: "Playera GaesSoft Edición Limitada",
      slugSeo: "playera-gaessoft",
      descripcionMd: "La mejor playera del POS de México",
      destacadoHome: true,
    },
  });
  assertOk(pub, 201, "publicar producto");
  ok(`tienda ${RETAIL_SLUG} activa · producto publicado en /playera-gaessoft`);

  step("Carrito anónimo desde el catálogo público");
  const cat2 = await call<{ items: Array<{ slugSeo: string }> }>(
    "GET",
    "/t/tienda/catalogo?destacado=true",
    { token: state.ownerToken },
  );
  info(`catálogo público lista ${cat2.body.items.length} producto(s) destacado(s)`);
  const carrito = await call<{ id: string; total: string }>("POST", "/t/tienda", {
    token: state.ownerToken,
    body: {
      sessionIdAnonimo: `sess-${SUFFIX}`,
      canal: "web",
      items: [{ varianteId: state.varianteId, cantidad: 2 }],
    },
  });
  assertOk(carrito, 201, "crear carrito");
  ok(`carrito con 2 unidades · total ${moneyMX(carrito.body.total)}`);

  step("Checkout con pago mock → pedido → venta + descuento de stock");
  const checkout = await call<{ folioPublico: string; intentId: string; total: string }>(
    "POST",
    "/t/checkout/iniciar",
    {
      token: state.ownerToken,
      body: {
        carritoId: carrito.body.id,
        emailComprador: "comprador@demo.mx",
        metodoPago: "tarjeta",
        proveedorPago: "mock",
        metodoEnvio: "paqueteria",
        direccionEnvio: {
          nombre: "Ana",
          calle: "Reforma",
          ciudad: "GDL",
          estado: "Jalisco",
          cp: "44100",
        },
        costoEnvio: "99",
      },
    },
  );
  assertOk(checkout, 201, "checkout iniciar");
  ok(
    `pedido ${c.bold}${checkout.body.folioPublico}${c.reset} creado · total ${moneyMX(checkout.body.total)} (incl. envío)`,
  );
  const confirm = await call<{ statusPago: string; ventaIdGenerada: string | null }>(
    "POST",
    "/t/checkout/confirmar-mock",
    { token: state.ownerToken, body: { intentId: checkout.body.intentId } },
  );
  assertOk(confirm, 200, "confirmar pago mock");
  ok(
    `pago confirmado → status ${c.green}${confirm.body.statusPago}${c.reset} · venta generada ${confirm.body.ventaIdGenerada ? "✓" : "✗"}`,
  );
  const inv = await call<{ items: Array<{ varianteId: string; stockActual: string }> }>(
    "GET",
    "/t/inventario",
    { token: state.ownerToken },
  );
  const stock = inv.body.items.find((i) => i.varianteId === state.varianteId)?.stockActual;
  info(`stock tras la venta ecommerce: ${stock ?? "?"} (100 − 2 = 98)`);

  // cliente para marketing
  const cliente = await call<{ id: string }>("POST", "/t/clientes", {
    token: state.ownerToken,
    body: {
      nombre: "Laura",
      apellidos: "Compradora",
      telefonoPrincipal: "3331112233",
      emailPrincipal: "laura@demo.mx",
    },
  });
  state.clienteId = cliente.body.id;
}

async function actoMarketing(state: RetailState): Promise<void> {
  act("ACTO 2 — Marketing (Promos + Lealtad + Campañas 4.2)");
  const token = state.ownerToken;

  step("Promoción automática 20% y venta POS que la aplica");
  const promo = await call<{ id: string }>("POST", "/t/promociones", {
    token,
    body: {
      nombre: "20% Playeras",
      tipo: "descuento_pct",
      acciones: { valor: 20 },
      vigenciaInicio: new Date(Date.now() - 86400000).toISOString(),
      canales: ["todos"],
      productos: [{ productoId: state.productoId, rol: "incluido" }],
    },
  });
  assertOk(promo, 201, "crear promo");
  await call("POST", `/t/promociones/${promo.body.id}/activar`, { token });
  await call("POST", `/t/cajas/${state.cajaId}/aperturar`, {
    token,
    body: { montoInicial: "100" },
  });
  const venta = await call<{ ventaId: string; total: string }>("POST", "/t/ventas", {
    token,
    body: {
      sucursalId: state.sucursalId,
      cajaId: state.cajaId,
      clienteId: state.clienteId,
      lineas: [{ varianteId: state.varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "300" }],
    },
  });
  assertOk(venta, 201, "venta con promo");
  const det = await call<{
    total: string;
    promocionesAplicadas: Array<{ promocion: { nombre: string } }>;
  }>("GET", `/t/ventas/${venta.body.ventaId}`, { token });
  ok(
    `venta total ${moneyMX(det.body.total)} · promos aplicadas: ${det.body.promocionesAplicadas.map((p) => p.promocion.nombre).join(", ") || "—"}`,
  );
  info("precio lista $299 → con 20% ≈ $239 (IVA recalculado sobre precio promocional)");

  step("Lealtad: inscribir cliente, acumular y canjear puntos");
  await call("PUT", "/t/lealtad/programa", {
    token,
    body: {
      nombre: "Puntos GaesSoft",
      reglaAcumulacion: { puntosPorPeso: 1 },
      valorPuntoRedimible: "0.1",
      requiereConsentimiento: true,
    },
  });
  await call("POST", "/t/lealtad/inscribir", {
    token,
    body: { clienteId: state.clienteId, consentimiento: true },
  });
  const acum = await call<{ puntosGanados: number }>("POST", "/t/lealtad/acumular", {
    token,
    body: { clienteId: state.clienteId, monto: "500" },
  });
  assertOk(acum, 200, "acumular puntos");
  const canje = await call<{ saldo: number; valorMxn: string }>("POST", "/t/lealtad/canjear", {
    token,
    body: { clienteId: state.clienteId, puntos: 200 },
  });
  assertOk(canje, 200, "canjear puntos");
  ok(
    `+${acum.body.puntosGanados} pts por ${moneyMX(500)} · canje 200 pts → saldo ${canje.body.saldo} pts (${moneyMX(canje.body.valorMxn)})`,
  );

  step("Campaña WhatsApp: segmento RFM → encolar → worker envía (mock)");
  await call("POST", "/t/segmentos/recalcular-rfm", { token });
  const seg = await call<{ id: string }>("POST", "/t/segmentos", {
    token,
    body: {
      nombre: "Todos activos",
      tipo: "dinamico_rfm",
      definicion: {
        segmentos: ["champion", "leal", "nuevo", "hibernando", "en_riesgo", "perdido"],
      },
    },
  });
  const plantilla = await call<{ id: string }>("POST", "/t/campanas/plantillas", {
    token,
    body: {
      nombre: "Promo WA",
      canal: "whatsapp",
      tipo: "promocional",
      contenidoHandlebars: "Hola {{nombre}}, 20% en playeras!",
    },
  });
  const campana = await call<{ id: string }>("POST", "/t/campanas", {
    token,
    body: {
      nombre: "Reactivación",
      objetivo: "reactivacion",
      canal: "whatsapp",
      segmentoId: seg.body.id,
      plantillaId: plantilla.body.id,
    },
  });
  assertOk(campana, 201, "crear campaña");
  const enc = await call<{ encolados: number }>("POST", `/t/campanas/${campana.body.id}/encolar`, {
    token,
  });
  const proc = await call<{ enviados: number }>("POST", `/t/campanas/${campana.body.id}/procesar`, {
    token,
  });
  ok(
    `campaña encoló ${enc.body.encolados} envío(s) · worker procesó ${proc.body.enviados} vía WhatsApp mock`,
  );
}

interface ClinicState {
  ownerToken: string;
  medicoToken: string;
  medicoUsuarioId: string;
  medicoLocalId: string;
  adminToken: string;
  professionalId: string;
  slugSeo: string;
  patientToken: string;
  patientId: string;
}

async function actoMarketplace(adminToken: string, state: ClinicState): Promise<void> {
  act("ACTO 3 — Marketplace (perfiles + búsqueda + reseñas 4.3)");
  state.adminToken = adminToken;

  step("Provisionar clínica + médico");
  state.ownerToken = await provisionTenant(
    adminToken,
    CLINIC_SLUG,
    "Clínica GaesSoft Demo",
    `owner-${CLINIC_SLUG}@demo.local`,
    "Owner!2026",
  );
  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: state.ownerToken,
  });
  const medicoRol = roles.body.find((r) => r.codigo === "medico");
  const medEmail = `medico-${CLINIC_SLUG}@demo.local`;
  const med = await call<{ id: string }>("POST", "/t/usuarios", {
    token: state.ownerToken,
    body: {
      email: medEmail,
      password: "Medico!2026",
      nombre: "Dra. House",
      rolIds: [medicoRol?.id],
    },
  });
  assertOk(med, 201, "crear médico");
  state.medicoUsuarioId = med.body.id;
  state.medicoToken = await loginTenant(CLINIC_SLUG, medEmail, "Medico!2026");
  await call("PUT", `/t/medicos/${state.medicoUsuarioId}`, {
    token: state.medicoToken,
    body: { cedulaProfesional: "MED-998877", especialidades: ["Cardiología"] },
  });
  const medico = await call<{ id: string }>("GET", `/t/medicos/${state.medicoUsuarioId}`, {
    token: state.medicoToken,
  });
  state.medicoLocalId = medico.body.id;
  ok(`clínica ${CLINIC_SLUG} · Dra. House (cédula MED-998877)`);

  step("Médico crea su perfil público y lo envía a revisión");
  const perfil = await call<{ id: string; slugSeo: string; status: string }>(
    "POST",
    "/t/marketplace/perfil",
    {
      token: state.medicoToken,
      body: {
        medicoIdLocal: state.medicoLocalId,
        tipo: "medico_humano",
        nombrePublico: "Dra. Gregoria House",
        cedulaProfesional: "MED-998877",
        especialidades: ["Cardiología", "Medicina Interna"],
        bioCorta: "Cardióloga con 20 años de experiencia.",
        aceptaTelemedicina: true,
      },
    },
  );
  assertOk(perfil, 201, "crear perfil");
  state.professionalId = perfil.body.id;
  state.slugSeo = perfil.body.slugSeo;
  await call("POST", `/t/marketplace/perfil/${state.professionalId}/ubicaciones`, {
    token: state.medicoToken,
    body: {
      nombreLugar: "Consultorio Centro Médico",
      ciudad: "Guadalajara",
      estado: "Jalisco",
      esPrincipal: true,
    },
  });
  await call("POST", `/t/marketplace/perfil/${state.professionalId}/enviar-revision`, {
    token: state.medicoToken,
  });
  ok(
    `perfil ${c.bold}/${state.slugSeo}${c.reset} en estado en_revision (status inicial: ${perfil.body.status})`,
  );

  step("Admin GaesSoft valida cédula SSa y publica");
  const val = await call<{ status: string; validadaSsaAt: string | null }>(
    "POST",
    `/marketplace/admin/perfiles/${state.professionalId}/validar`,
    { token: adminToken, body: { cedulaValidaSsa: true, aprobar: true } },
  );
  assertOk(val, 200, "admin valida");
  ok(`perfil publicado · cédula validada SSa: ${val.body.validadaSsaAt ? "✓" : "✗"}`);

  step("Búsqueda pública del marketplace + perfil por slug");
  const busca = await call<{ total: number }>(
    "GET",
    "/marketplace/buscar?q=house&ciudad=Guadalajara",
  );
  assertOk(busca, 200, "búsqueda pública");
  const pub = await call<{ nombrePublico: string }>(
    "GET",
    `/marketplace/profesionales/${state.slugSeo}`,
  );
  ok(
    `búsqueda "house" en Guadalajara → ${busca.body.total} resultado(s) · perfil público: ${pub.body.nombrePublico}`,
  );

  step("Paciente verificado deja una reseña");
  await call("POST", "/marketplace/pacientes/registro", {
    body: { email: `resena-${SUFFIX}@demo.mx`, nombre: "Pedro Reseña" },
  });
  await call("POST", "/marketplace/pacientes/confirmar", {
    body: { email: `resena-${SUFFIX}@demo.mx` },
  });
  const review = await call<{ moderacionStatus: string; publicada: boolean }>(
    "POST",
    `/marketplace/profesionales/${state.professionalId}/resenas`,
    {
      body: {
        pacienteEmail: `resena-${SUFFIX}@demo.mx`,
        bookingId: "demo-booking",
        ratingGeneral: 5,
        comentario: "Excelente trato, muy clara al explicar.",
      },
    },
  );
  assertOk(review, 201, "crear reseña");
  ok(
    `reseña 5★ → moderación: ${c.green}${review.body.moderacionStatus}${c.reset} (auto-publicada: ${review.body.publicada})`,
  );
}

async function actoPhr(state: ClinicState): Promise<void> {
  act("ACTO 4 — Portal paciente PHR (4.4)");

  step("Login del paciente sin contraseña (OTP por WhatsApp)");
  const reqOtp = await call<{ debugCode: string }>("POST", "/auth/patient/request-otp", {
    body: { phoneE164: PATIENT_PHONE },
  });
  assertOk(reqOtp, 200, "request-otp");
  const verify = await call<{ accessToken: string; patient: { id: string } }>(
    "POST",
    "/auth/patient/verify-otp",
    { body: { phoneE164: PATIENT_PHONE, code: reqOtp.body.debugCode } },
  );
  assertOk(verify, 200, "verify-otp");
  state.patientToken = verify.body.accessToken;
  state.patientId = verify.body.patient.id;
  await call("PATCH", "/patient-portal/me", {
    token: state.patientToken,
    body: { nombre: "Laura Paciente", bloodType: "O+" },
  });
  ok(`paciente autenticado por OTP (${PATIENT_PHONE}) · identidad = teléfono, sin contraseña`);

  step("La clínica registra el consentimiento y publica un registro clínico");
  await call("POST", "/t/phr/consentimientos", {
    token: state.medicoToken,
    body: { patientId: state.patientId, scope: "full_phr" },
  });
  const rec = await call<{ id: string }>("POST", "/t/phr/registros", {
    token: state.medicoToken,
    body: {
      patientId: state.patientId,
      resourceType: "Encounter",
      summaryText: "Consulta de control cardiológico",
      isCritical: false,
      data: { resourceType: "Encounter", status: "finished", class: "AMB" },
    },
  });
  assertOk(rec, 201, "publicar registro");
  ok("clínica con consent full_phr publicó un Encounter al PHR del paciente");

  step("El paciente ve su expediente unificado cross-tenant");
  const exp = await call<Array<{ tenantId: string; resourceType: string; summaryText: string }>>(
    "GET",
    "/patient-portal/expediente",
    { token: state.patientToken },
  );
  assertOk(exp, 200, "expediente");
  ok(
    `expediente: ${exp.body.length} registro(s) — ${exp.body.map((r) => r.resourceType).join(", ")}`,
  );
  info("el paciente es dueño de su PHR: lo vería igual desde cualquier consultorio (el moat)");

  step("QR de emergencia (campos opt-in) + lectura pública");
  const qr = await call<{ qrToken: string }>("POST", "/patient-portal/emergency-qr", {
    token: state.patientToken,
    body: { visibleFields: ["blood_type"] },
  });
  assertOk(qr, 201, "generar QR");
  const qrPub = await call<{ bloodType?: string }>("GET", `/emergency/${qr.body.qrToken}`);
  assertOk(qrPub, 200, "QR público");
  ok(
    `QR público (sin login) muestra solo lo opt-in → tipo de sangre: ${c.bold}${qrPub.body.bloodType}${c.reset}`,
  );

  step("Export ARCO (portabilidad de datos) + audit log");
  const exportArco = await call<{ records: unknown[]; consents: unknown[] }>(
    "GET",
    "/patient-portal/export",
    { token: state.patientToken },
  );
  assertOk(exportArco, 200, "export ARCO");
  const audit = await call<Array<{ action: string }>>("GET", "/patient-portal/audit", {
    token: state.patientToken,
  });
  ok(
    `export ARCO: ${exportArco.body.records.length} registro(s) + ${exportArco.body.consents.length} consent(s) · audit log: ${audit.body.length} evento(s)`,
  );
}

async function main(): Promise<void> {
  console.log(`${c.bold}Demo Hito 4 — Digital y marketing${c.reset}`);
  console.log(
    `${c.dim}API: ${API_URL} · retail: ${RETAIL_SLUG} · clínica: ${CLINIC_SLUG}${c.reset}`,
  );

  const adminToken = await loginAdmin();
  const retail: RetailState = {
    ownerToken: "",
    sucursalId: "",
    cajaId: "",
    varianteId: "",
    productoId: "",
    clienteId: "",
  };
  await actoTienda(adminToken, retail);
  await actoMarketing(retail);

  const clinic: ClinicState = {
    ownerToken: "",
    medicoToken: "",
    medicoUsuarioId: "",
    medicoLocalId: "",
    adminToken: "",
    professionalId: "",
    slugSeo: "",
    patientToken: "",
    patientId: "",
  };
  await actoMarketplace(adminToken, clinic);
  await actoPhr(clinic);

  console.log(
    `\n${c.bold}${c.green}✓ Demo Hito 4 completo — tienda + marketing + Marketplace + PHR end-to-end${c.reset}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`${c.red}Demo falló:${c.reset}`, err);
  process.exit(1);
});

export {};
