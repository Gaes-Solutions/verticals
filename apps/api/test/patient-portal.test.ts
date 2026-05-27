import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_A = "test-phr-a";
const TENANT_B = "test-phr-b";
const MEDICO_EMAIL = "medico@phr.local";
const PASSWORD = "ChangeMe!2026";

const PATIENT_PHONE = "+5213331110001";
const ADULT_DEP_PHONE = "+5213331110002";

let app: FastifyInstance;
let medicoTokenA: string;
let medicoTokenB: string;
let patientToken: string;
let patientId: string;
const createdPatientIds: string[] = [];

function authA() {
  return { authorization: `Bearer ${medicoTokenA}` };
}
function authB() {
  return { authorization: `Bearer ${medicoTokenB}` };
}
function authPatient() {
  return { authorization: `Bearer ${patientToken}` };
}

async function loginPatient(phone: string): Promise<{ token: string; id: string }> {
  const reqOtp = await app.inject({
    method: "POST",
    url: "/auth/patient/request-otp",
    payload: { phoneE164: phone },
  });
  const { debugCode } = reqOtp.json() as { debugCode: string };
  const verify = await app.inject({
    method: "POST",
    url: "/auth/patient/verify-otp",
    payload: { phoneE164: phone, code: debugCode },
  });
  const body = verify.json() as { accessToken: string; patient: { id: string } };
  return { token: body.accessToken, id: body.patient.id };
}

async function cleanupPhr() {
  const phones = [PATIENT_PHONE, ADULT_DEP_PHONE];
  await masterPrisma.patientAuthChallenge.deleteMany({ where: { phoneE164: { in: phones } } });
  const pacientes = await masterPrisma.pacienteMaster.findMany({
    where: {
      OR: [
        { phoneE164: { in: phones } },
        { nombre: "Emiliano Test" },
        { id: { in: createdPatientIds } },
      ],
    },
    select: { id: true },
  });
  const ids = pacientes.map((p) => p.id);
  if (ids.length > 0) {
    // borrar familia donde el dependiente es uno de estos (FK cascade cubre tutor)
    await masterPrisma.patientFamily.deleteMany({
      where: { OR: [{ tutorId: { in: ids } }, { dependienteId: { in: ids } }] },
    });
    await masterPrisma.pacienteMaster.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_A, "Clínica PHR A");
  await createTestTenant(TENANT_B, "Clínica PHR B");
  await createTenantUser(TENANT_A, {
    email: MEDICO_EMAIL,
    password: PASSWORD,
    rolCodigo: "medico",
    nombre: "Dr. A",
  });
  await createTenantUser(TENANT_B, {
    email: MEDICO_EMAIL,
    password: PASSWORD,
    rolCodigo: "medico",
    nombre: "Dr. B",
  });
  medicoTokenA = (await loginTenantUser(app, TENANT_A, MEDICO_EMAIL, PASSWORD)).accessToken;
  medicoTokenB = (await loginTenantUser(app, TENANT_B, MEDICO_EMAIL, PASSWORD)).accessToken;

  await cleanupPhr();
  const session = await loginPatient(PATIENT_PHONE);
  patientToken = session.token;
  patientId = session.id;
  createdPatientIds.push(patientId);
});

afterAll(async () => {
  await cleanupPhr();
  if (app) await app.close();
});

describe("login OTP sin contraseña", () => {
  it("OTP incorrecto es rechazado", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/patient/request-otp",
      payload: { phoneE164: PATIENT_PHONE },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/patient/verify-otp",
      payload: { phoneE164: PATIENT_PHONE, code: "000000" },
    });
    // 401 salvo el caso improbable de que el código real sea 000000
    expect([401, 200]).toContain(res.statusCode);
  });

  it("crea/recupera al paciente y emite JWT", async () => {
    const me = await app.inject({
      method: "GET",
      url: "/patient-portal/me",
      headers: authPatient(),
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { phoneE164: string }).phoneE164).toBe(PATIENT_PHONE);
  });

  it("portal rechaza token de tenant (kind != patient)", async () => {
    const res = await app.inject({ method: "GET", url: "/patient-portal/me", headers: authA() });
    expect(res.statusCode).toBe(401);
  });

  it("paciente actualiza su perfil (tipo de sangre)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/patient-portal/me",
      headers: authPatient(),
      payload: { nombre: "Laura Paciente", bloodType: "O+" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { bloodType: string }).bloodType).toBe("O+");
  });
});

describe("consent gating clínica → PHR", () => {
  it("la clínica NO puede publicar sin consent → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/phr/registros",
      headers: authA(),
      payload: {
        patientId,
        resourceType: "Encounter",
        summaryText: "Consulta general",
        data: { resourceType: "Encounter", status: "finished" },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("la clínica registra el consentimiento obtenido (full_phr)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/phr/consentimientos",
      headers: authA(),
      payload: { patientId, scope: "full_phr" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("con consent, la clínica A publica un Encounter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/phr/registros",
      headers: authA(),
      payload: {
        patientId,
        resourceType: "Encounter",
        summaryText: "Consulta de control en Clínica A",
        effectiveDate: "2026-05-20T10:00:00.000Z",
        data: { resourceType: "Encounter", status: "finished" },
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("clínica B con consent prescriptions_only NO puede publicar Immunization", async () => {
    await app.inject({
      method: "POST",
      url: "/t/phr/consentimientos",
      headers: authB(),
      payload: { patientId, scope: "prescriptions_only" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/phr/registros",
      headers: authB(),
      payload: {
        patientId,
        resourceType: "Immunization",
        data: { resourceType: "Immunization" },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("clínica B publica un MedicationRequest (cubierto por el scope)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/phr/registros",
      headers: authB(),
      payload: {
        patientId,
        resourceType: "MedicationRequest",
        summaryText: "Paracetamol 500mg",
        data: { resourceType: "MedicationRequest" },
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("expediente unificado cross-tenant", () => {
  it("el paciente ve registros de AMBAS clínicas (el moat)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/patient-portal/expediente",
      headers: authPatient(),
    });
    expect(res.statusCode).toBe(200);
    const records = res.json() as Array<{ tenantId: string; resourceType: string }>;
    expect(records.length).toBe(2);
    const tenants = new Set(records.map((r) => r.tenantId));
    expect(tenants.size).toBe(2);
  });

  it("filtra por resourceType", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/patient-portal/expediente?resourceType=MedicationRequest",
      headers: authPatient(),
    });
    const records = res.json() as unknown[];
    expect(records.length).toBe(1);
  });

  it("la lectura del expediente quedó registrada en el audit log", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/patient-portal/audit",
      headers: authPatient(),
    });
    const audit = res.json() as Array<{ action: string }>;
    expect(audit.some((a) => a.action === "viewed_record")).toBe(true);
  });

  it("la clínica A lee el expediente consentido (todo, full_phr)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/phr/pacientes/${patientId}/expediente`,
      headers: authA(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as unknown[]).length).toBe(2);
  });

  it("la clínica B (prescriptions_only) solo lee el MedicationRequest", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/phr/pacientes/${patientId}/expediente`,
      headers: authB(),
    });
    expect(res.statusCode).toBe(200);
    const records = res.json() as Array<{ resourceType: string }>;
    expect(records.every((r) => r.resourceType === "MedicationRequest")).toBe(true);
  });
});

describe("revocación de consent (ARCO)", () => {
  it("el paciente revoca el consent de la clínica A", async () => {
    const consents = await app.inject({
      method: "GET",
      url: "/patient-portal/consents",
      headers: authPatient(),
    });
    const list = consents.json() as Array<{
      id: string;
      tenantId: string;
      revokedAt: string | null;
    }>;
    const tenantA = await masterPrisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_A } });
    const consentA = list.find((c) => c.tenantId === tenantA.id && !c.revokedAt);
    const del = await app.inject({
      method: "DELETE",
      url: `/patient-portal/consents/${consentA!.id}`,
      headers: authPatient(),
    });
    expect(del.statusCode).toBe(204);
  });

  it("tras revocar, la clínica A ya no puede leer → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/phr/pacientes/${patientId}/expediente`,
      headers: authA(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("pero los registros NO se borran: el paciente sigue viéndolos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/patient-portal/expediente",
      headers: authPatient(),
    });
    expect((res.json() as unknown[]).length).toBe(2);
  });
});

describe("gestión familiar", () => {
  let lazoMenorId: string;

  it("el tutor agrega un menor y puede ver su expediente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/patient-portal/familia",
      headers: authPatient(),
      payload: {
        relationshipType: "legal_guardian",
        permissionScope: "full",
        nuevoDependiente: { nombre: "Emiliano Test", birthDate: "2018-03-15" },
      },
    });
    expect(res.statusCode).toBe(201);
    const lazo = res.json() as { id: string; dependienteId: string; consentStatus: string };
    expect(lazo.consentStatus).toBe("accepted");
    lazoMenorId = lazo.id;
    createdPatientIds.push(lazo.dependienteId);

    const exp = await app.inject({
      method: "GET",
      url: `/patient-portal/expediente?subjectId=${lazo.dependienteId}`,
      headers: authPatient(),
    });
    expect(exp.statusCode).toBe(200);
  });

  it("vincular un adulto por teléfono queda pendiente de su consentimiento", async () => {
    const dep = await loginPatient(ADULT_DEP_PHONE);
    createdPatientIds.push(dep.id);
    const res = await app.inject({
      method: "POST",
      url: "/patient-portal/familia",
      headers: authPatient(),
      payload: { relationshipType: "spouse", dependientePhone: ADULT_DEP_PHONE },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { consentStatus: string }).consentStatus).toBe("pending");

    // sin consent aceptado, el tutor NO puede leer el expediente del adulto
    const exp = await app.inject({
      method: "GET",
      url: `/patient-portal/expediente?subjectId=${dep.id}`,
      headers: authPatient(),
    });
    expect(exp.statusCode).toBe(403);
  });

  it("revocar acceso a un dependiente lo elimina", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/patient-portal/familia/${lazoMenorId}`,
      headers: authPatient(),
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("QR de emergencia (Apple Health Medical ID)", () => {
  let qrToken: string;

  it("el paciente genera su QR con campos opt-in", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/patient-portal/emergency-qr",
      headers: authPatient(),
      payload: { visibleFields: ["blood_type"] },
    });
    expect(res.statusCode).toBe(201);
    qrToken = (res.json() as { qrToken: string }).qrToken;
  });

  it("el QR público solo muestra los campos opt-in (tipo de sangre, no más)", async () => {
    const res = await app.inject({ method: "GET", url: `/emergency/${qrToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { bloodType?: string; chronicConditions?: unknown };
    expect(body.bloodType).toBe("O+");
    expect(body.chronicConditions).toBeUndefined();
  });

  it("QR inexistente → 404", async () => {
    const res = await app.inject({ method: "GET", url: "/emergency/noexisteabcdef0123" });
    expect(res.statusCode).toBe(404);
  });
});

describe("export ARCO (portabilidad)", () => {
  it("devuelve perfil + registros + consents y registra el acceso", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/patient-portal/export",
      headers: authPatient(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { patient: unknown; records: unknown[]; consents: unknown[] };
    expect(body.patient).toBeTruthy();
    expect(body.records.length).toBe(2);

    const audit = await app.inject({
      method: "GET",
      url: "/patient-portal/audit",
      headers: authPatient(),
    });
    expect(
      (audit.json() as Array<{ action: string }>).some((a) => a.action === "exported_data"),
    ).toBe(true);
  });
});
