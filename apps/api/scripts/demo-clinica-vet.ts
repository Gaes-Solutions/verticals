/**
 * Demo end-to-end Hito 3.2 + 3.3 + 3.4 — Clínica humana + veterinaria + hospitalización N3
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000):
 *
 *   1. Login admin → crea tenant clínica fresh + bootstrap dueño
 *   2. Dueño crea médico, enfermera, recepción (roles preset salud)
 *   3. Verifica catálogos clínicos sembrados (CIE-10, PLM, vacunas, categorías)
 *   4. Recepción crea paciente humano + mascota vet (con tutor)
 *   5. Médico abre consulta SOAP humana → firma (inmutable NOM-024)
 *   6. Médico emite receta con QR + valida públicamente por token
 *   7. Aplica vacuna a la mascota → consulta cartilla con próxima dosis
 *   8. Dueño crea camas (general + UCI)
 *   9. Médico ingresa paciente a hospitalización (cama→ocupada + cargo auto)
 *  10. Programa medicación → expande kardex; enfermera aplica primera dosis
 *  11. Enfermera captura signos vitales con alerta (fiebre)
 *  12. Recepción da de alta → libera cama + genera venta borrador con cargos
 *
 * Uso:  pnpm --filter @gaespos/api demo:clinica-vet
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const TENANT_SLUG = `demo-clinica-${Date.now().toString(36)}`;
const OWNER_EMAIL = `owner-${TENANT_SLUG}@demo.local`;
const OWNER_PASSWORD = "Owner!2026";
const MEDICO_EMAIL = `medico-${TENANT_SLUG}@demo.local`;
const MEDICO_PASSWORD = "Medico!2026";
const ENFERMERA_EMAIL = `enf-${TENANT_SLUG}@demo.local`;
const ENFERMERA_PASSWORD = "Enf!2026";
const RECEPCION_EMAIL = `rec-${TENANT_SLUG}@demo.local`;
const RECEPCION_PASSWORD = "Rec!2026";

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
  medicoToken: string;
  enfermeraToken: string;
  recepcionToken: string;
  medicoUsuarioId: string;
  sucursalId: string;
  pacienteId: string;
  mascotaId: string;
  camaUciId: string;
}

async function crearUsuarioRol(
  ownerToken: string,
  rolCodigo: string,
  email: string,
  password: string,
  nombre: string,
): Promise<string> {
  const roles = await call<Array<{ id: string; codigo: string }>>("GET", "/t/roles", {
    token: ownerToken,
  });
  const rol = roles.body.find((r) => r.codigo === rolCodigo);
  if (!rol) throw new Error(`rol preset '${rolCodigo}' no sembrado`);
  const u = await call<{ id: string }>("POST", "/t/usuarios", {
    token: ownerToken,
    body: { email, password, nombre, rolIds: [rol.id] },
  });
  assertOk(u, 201, `crear ${rolCodigo}`);
  return u.body.id;
}

async function setup(state: State): Promise<void> {
  step("Login admin + crea tenant clínica (plan growth)");
  state.adminToken = await loginAdmin();
  const t = await call("POST", "/tenants", {
    token: state.adminToken,
    body: { slug: TENANT_SLUG, name: "Clínica Demo Salud", planCode: "growth" },
  });
  assertOk(t, 201, "POST tenant");
  ok(
    `tenant ${TENANT_SLUG} creado — seed: roles salud + catálogos CIE-10/PLM/vacunas + categorías contables`,
  );

  step("Bootstrap dueño + crea equipo clínico (médico, enfermera, recepción)");
  const own = await call("POST", `/tenants/${TENANT_SLUG}/bootstrap-owner`, {
    token: state.adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dra. Dueña" },
  });
  assertOk(own, 201, "bootstrap owner");
  state.ownerToken = await loginTenant(OWNER_EMAIL, OWNER_PASSWORD);
  state.medicoUsuarioId = await crearUsuarioRol(
    state.ownerToken,
    "medico",
    MEDICO_EMAIL,
    MEDICO_PASSWORD,
    "Dr. Internista",
  );
  await crearUsuarioRol(
    state.ownerToken,
    "enfermera",
    ENFERMERA_EMAIL,
    ENFERMERA_PASSWORD,
    "Enf. Turno A",
  );
  await crearUsuarioRol(
    state.ownerToken,
    "recepcion",
    RECEPCION_EMAIL,
    RECEPCION_PASSWORD,
    "Recepción",
  );
  state.medicoToken = await loginTenant(MEDICO_EMAIL, MEDICO_PASSWORD);
  state.enfermeraToken = await loginTenant(ENFERMERA_EMAIL, ENFERMERA_PASSWORD);
  state.recepcionToken = await loginTenant(RECEPCION_EMAIL, RECEPCION_PASSWORD);
  ok("equipo clínico creado: médico + enfermera + recepción (roles preset)");

  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", {
    token: state.ownerToken,
  });
  state.sucursalId = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";
}

async function verificarCatalogos(state: State): Promise<void> {
  step("Verifica catálogos clínicos sembrados");
  const dx = await call<Array<{ codigoCie10: string; aplicaVet: boolean }>>(
    "GET",
    "/t/consultas/diagnosticos/catalogo",
    { token: state.medicoToken },
  );
  assertOk(dx, 200, "catálogo CIE-10");
  const vetDx = dx.body.filter((d) => d.aplicaVet).length;
  ok(
    `${dx.body.length} diagnósticos CIE-10 (${vetDx} aplican a veterinaria, ej. V-007 parvovirosis)`,
  );

  const vacs = await call<Array<{ nombreComercial: string }>>("GET", "/t/vacunaciones/catalogo", {
    token: state.medicoToken,
  });
  assertOk(vacs, 200, "catálogo vacunas");
  ok(`${vacs.body.length} vacunas catálogo (humanas SSa + vet: Antirrábica, Triple felina, etc.)`);
}

async function flujoConsultaHumana(state: State): Promise<void> {
  step("Recepción registra paciente humano");
  const pac = await call<{ id: string; numeroExpediente: string }>("POST", "/t/pacientes", {
    token: state.recepcionToken,
    body: {
      nombre: "Juan",
      apellidoPaterno: "Pérez",
      sexo: "masculino",
      fechaNacimiento: "1985-03-15T00:00:00.000Z",
    },
  });
  assertOk(pac, 201, "crear paciente");
  state.pacienteId = pac.body.id;
  ok(`paciente ${pac.body.numeroExpediente} (Juan Pérez)`);

  step("Médico abre consulta SOAP → firma (inmutable NOM-024)");
  const dx = await call<Array<{ id: string; codigoCie10: string }>>(
    "GET",
    "/t/consultas/diagnosticos/catalogo?vertical=humano",
    { token: state.medicoToken },
  );
  const dxId = dx.body[0]?.id;
  const consulta = await call<{ id: string; estado: string }>("POST", "/t/consultas", {
    token: state.medicoToken,
    body: {
      pacienteId: state.pacienteId,
      medicoUsuarioId: state.medicoUsuarioId,
      sucursalId: state.sucursalId,
      tipo: "primera_vez",
      motivoConsulta: "Tos y fiebre 3 días",
      ...(dxId ? { diagnosticoPrincipalId: dxId } : {}),
      planTratamiento: "Antibiótico + reposo",
    },
  });
  assertOk(consulta, 201, "crear consulta");
  info(`consulta creada en estado=${consulta.body.estado}`);
  const firma = await call<{ estado: string }>("POST", `/t/consultas/${consulta.body.id}/firmar`, {
    token: state.medicoToken,
    body: {},
  });
  assertOk(firma, 200, "firmar consulta");
  ok(`consulta firmada (estado=${firma.body.estado}, inmutable)`);

  step("Médico emite receta con QR + validación pública");
  const meds = await call<Array<{ id: string; nombreComercial: string }>>(
    "GET",
    "/t/recetas/medicamentos/catalogo",
    { token: state.medicoToken },
  );
  const amox =
    meds.body.find((m) => m.nombreComercial.toLowerCase().includes("amox")) ?? meds.body[0];
  const receta = await call<{ id: string; folio: string; qrValidacionToken: string }>(
    "POST",
    "/t/recetas",
    {
      token: state.medicoToken,
      body: {
        pacienteId: state.pacienteId,
        medicoUsuarioId: state.medicoUsuarioId,
        sucursalId: state.sucursalId,
        consultaId: consulta.body.id,
        items: amox
          ? [
              {
                medicamentoCatalogoId: amox.id,
                nombreSnapshot: amox.nombreComercial,
                dosisUnidad: "tableta",
                dosisCantidad: 1,
                dosisVia: "oral",
                frecuenciaHoras: 8,
                duracionDias: 7,
              },
            ]
          : [],
      },
    },
  );
  assertOk(receta, 201, "emitir receta");
  ok(`receta ${receta.body.folio} con QR token ${receta.body.qrValidacionToken.slice(0, 12)}…`);
  const valida = await call<{ vigente: boolean }>(
    "GET",
    `/t/recetas/validar/${receta.body.qrValidacionToken}`,
    { token: state.medicoToken },
  );
  assertOk(valida, 200, "validar receta por QR");
  ok(`validación del QR: vigente=${valida.body.vigente}`);
}

async function flujoVacunaVet(state: State): Promise<void> {
  step("Recepción registra mascota (vet) con tutor");
  const tutor = await call<{ id: string }>("POST", "/t/clientes", {
    token: state.recepcionToken,
    body: { nombre: "Laura", apellidos: "Gómez", telefonoPrincipal: "3331112222" },
  });
  const mascota = await call<{ id: string; numeroExpediente: string }>("POST", "/t/mascotas", {
    token: state.recepcionToken,
    body: { nombre: "Firulais", especie: "perro", raza: "Labrador", tutorClienteId: tutor.body.id },
  });
  assertOk(mascota, 201, "crear mascota");
  state.mascotaId = mascota.body.id;
  ok(`mascota ${mascota.body.numeroExpediente} (Firulais, perro)`);

  step("Médico aplica vacuna antirrábica con lote + caducidad");
  const vacs = await call<Array<{ id: string; nombreComercial: string }>>(
    "GET",
    "/t/vacunaciones/catalogo",
    { token: state.medicoToken },
  );
  const antirrabica =
    vacs.body.find((v) => v.nombreComercial.includes("Antirrábica")) ?? vacs.body[0];
  if (!antirrabica) throw new Error("sin vacunas en catálogo");
  const vac = await call<{ proximaAplicacionFecha: string | null }>("POST", "/t/vacunaciones", {
    token: state.medicoToken,
    body: {
      mascotaId: state.mascotaId,
      vacunaCatalogoId: antirrabica.id,
      fechaAplicacion: new Date().toISOString(),
      numeroLote: "LOTE-AR-2026-A1",
      caducidadLote: new Date(Date.now() + 365 * 86400000).toISOString(),
      viaAdministracion: "subcutanea",
    },
  });
  assertOk(vac, 201, "aplicar vacuna");
  ok(`vacuna ${antirrabica.nombreComercial} aplicada (lote LOTE-AR-2026-A1, rastreable)`);

  step("Consulta cartilla de vacunación de la mascota");
  const cartilla = await call<{
    sujeto: { nombre: string };
    vacunacionesAplicadas: Array<{ vacunaNombre: string; estado: string }>;
    proximasDosis: Array<{ vacunaNombre: string; diasFaltantes: number }>;
  }>("GET", `/t/vacunaciones/cartilla?mascotaId=${state.mascotaId}`, { token: state.medicoToken });
  assertOk(cartilla, 200, "cartilla");
  ok(
    `cartilla de ${cartilla.body.sujeto.nombre}: ${cartilla.body.vacunacionesAplicadas.length} aplicada(s)`,
  );
  for (const p of cartilla.body.proximasDosis) {
    info(`próxima dosis: ${p.vacunaNombre} en ${p.diasFaltantes} días`);
  }
}

async function flujoHospitalizacion(state: State): Promise<void> {
  step("Dueño crea camas (general + UCI)");
  await call("POST", "/t/camas", {
    token: state.ownerToken,
    body: { sucursalId: state.sucursalId, codigo: "GEN-01", tipo: "general", tarifaPorNoche: 800 },
  });
  const uci = await call<{ id: string; codigo: string }>("POST", "/t/camas", {
    token: state.ownerToken,
    body: {
      sucursalId: state.sucursalId,
      codigo: "UCI-01",
      tipo: "cuidados_intensivos",
      tarifaPorNoche: 2500,
    },
  });
  assertOk(uci, 201, "crear cama UCI");
  state.camaUciId = uci.body.id;
  ok("camas GEN-01 ($800/noche) + UCI-01 ($2,500/noche) creadas");

  step("Médico ingresa paciente a UCI (cama→ocupada + cargo estancia automático)");
  const hosp = await call<{ hospitalizacionId: string; folio: string }>(
    "POST",
    "/t/hospitalizaciones",
    {
      token: state.medicoToken,
      body: {
        sucursalId: state.sucursalId,
        camaId: state.camaUciId,
        pacienteId: state.pacienteId,
        medicoResponsableId: state.medicoUsuarioId,
        motivoIngreso: "Neumonía grave — requiere O2",
      },
    },
  );
  assertOk(hosp, 201, "ingresar hospitalización");
  const hid = hosp.body.hospitalizacionId;
  ok(`hospitalización ${hosp.body.folio} abierta`);
  const cama = await call<{ estado: string }>("GET", `/t/camas/${state.camaUciId}`, {
    token: state.medicoToken,
  });
  info(`cama UCI-01 ahora: estado=${cama.body.estado}`);

  step("Médico programa medicación → expande kardex automático");
  const meds = await call<Array<{ id: string; nombreComercial: string }>>(
    "GET",
    "/t/recetas/medicamentos/catalogo",
    { token: state.medicoToken },
  );
  const med =
    meds.body.find((m) => m.nombreComercial.toLowerCase().includes("amox")) ?? meds.body[0];
  if (!med) throw new Error("sin medicamentos");
  const prog = await call<{ medicacionProgramadaId: string; kardexCreados: number }>(
    "POST",
    `/t/hospitalizaciones/${hid}/medicaciones`,
    {
      token: state.medicoToken,
      body: {
        medicamentoCatalogoId: med.id,
        dosis: "500 mg",
        via: "IV",
        frecuenciaHoras: 8,
        duracionDias: 5,
        horaInicio: new Date(Date.now() + 5 * 60000).toISOString(),
        indicacionMedica: "Antibiótico IV c/8h x 5 días",
      },
    },
  );
  assertOk(prog, 201, "programar medicación");
  ok(`medicación c/8h x 5d → ${prog.body.kardexCreados} dosis programadas en kardex`);

  step("Enfermera aplica primera dosis del kardex");
  const kardex = await call<Array<{ id: string; estado: string }>>(
    "GET",
    `/t/hospitalizaciones/kardex?hospitalizacionId=${hid}&estado=pendiente`,
    { token: state.enfermeraToken },
  );
  const primera = kardex.body[0];
  if (!primera) throw new Error("sin kardex pendiente");
  const aplicar = await call("POST", `/t/hospitalizaciones/kardex/${primera.id}/aplicar`, {
    token: state.enfermeraToken,
    body: { estado: "aplicada", notas: "Sin reacción adversa" },
  });
  assertOk(aplicar, 204, "aplicar kardex");
  ok("primera dosis aplicada por enfermera (registro append-only)");

  step("Enfermera captura signos vitales → alerta automática");
  const signos = await call<{ alertasMarcadas: Record<string, boolean> }>(
    "POST",
    `/t/hospitalizaciones/${hid}/signos-vitales`,
    {
      token: state.enfermeraToken,
      body: { temperaturaC: "39.5", frecuenciaCardiaca: 110, saturacionO2: 89 },
    },
  );
  assertOk(signos, 201, "signos vitales");
  const alertas = Object.keys(signos.body.alertasMarcadas).join(", ");
  ok(`signos capturados → alertas rule-based: ${c.red}${alertas}${c.reset} (T°39.5, SatO2 89%)`);

  step("Recepción da de alta → libera cama + genera venta con cargos");
  const alta = await call<{
    ventaBorradorId: string | null;
    montoTotal: string;
    camaLiberadaId: string;
  }>("POST", `/t/hospitalizaciones/${hid}/alta`, {
    token: state.recepcionToken,
    body: { motivoAlta: "Mejoría clínica", observaciones: "Continuar antibiótico VO en casa" },
  });
  assertOk(alta, 200, "dar alta");
  ok(`alta procesada → venta borrador creada con total ${moneyMX(alta.body.montoTotal)}`);
  const camaPost = await call<{ estado: string }>("GET", `/t/camas/${state.camaUciId}`, {
    token: state.recepcionToken,
  });
  info(`cama UCI-01 tras alta: estado=${camaPost.body.estado} (lista para limpieza→libre)`);
}

async function main(): Promise<void> {
  console.log(
    `${c.bold}${c.magenta}🏥 Demo Clínica Humana + Veterinaria + Hospitalización N3${c.reset}`,
  );
  console.log(`${c.dim}API: ${API_URL} · tenant: ${TENANT_SLUG}${c.reset}`);
  const state = {} as State;
  await setup(state);
  await verificarCatalogos(state);
  await flujoConsultaHumana(state);
  await flujoVacunaVet(state);
  await flujoHospitalizacion(state);
  console.log(`\n${c.bold}${c.green}✅ Demo clínica completo — todos los pasos verdes${c.reset}\n`);
}

main().catch((err) => {
  console.error(
    `\n${c.red}✗ Demo falló: ${err instanceof Error ? err.message : String(err)}${c.reset}`,
  );
  process.exit(1);
});

export {};
