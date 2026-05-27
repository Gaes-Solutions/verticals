import { createHash, randomBytes, randomInt } from "node:crypto";
import type {
  ConsentScope,
  FhirResourceType,
  MasterPrismaClient,
  PacienteMaster,
  PatientConsent,
  PatientEmergencyQr,
  PatientFamily,
  PatientRecord,
} from "@gaespos/db";

export class PhrError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PhrError";
  }
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const DEVICE_TRUST_DAYS = 30;

function hashOtp(phoneE164: string, code: string): string {
  return createHash("sha256").update(`${phoneE164}:${code}`).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP login sin contraseña (identidad = phoneE164)
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestOtpResult {
  challengeId: string;
  code: string;
  method: string;
}

export async function requestOtp(
  master: MasterPrismaClient,
  input: { phoneE164: string; method?: "whatsapp" | "sms" | undefined },
): Promise<RequestOtpResult> {
  const method = input.method ?? "whatsapp";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = await master.patientAuthChallenge.create({
    data: {
      phoneE164: input.phoneE164,
      codeHash: hashOtp(input.phoneE164, code),
      method,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return { challengeId: challenge.id, code, method };
}

export interface VerifyOtpResult {
  patient: PacienteMaster;
  deviceTrusted: boolean;
}

export async function verifyOtp(
  master: MasterPrismaClient,
  input: {
    phoneE164: string;
    code: string;
    deviceFingerprint?: string | undefined;
    deviceName?: string | undefined;
    recordarDispositivo?: boolean | undefined;
    ip?: string | undefined;
  },
): Promise<VerifyOtpResult> {
  const challenge = await master.patientAuthChallenge.findFirst({
    where: { phoneE164: input.phoneE164, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new PhrError(400, "No hay un código OTP pendiente para este número");
  if (challenge.expiresAt < new Date()) throw new PhrError(400, "El código OTP expiró");
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw new PhrError(429, "Demasiados intentos; solicita un nuevo código");
  }
  if (challenge.codeHash !== hashOtp(input.phoneE164, input.code)) {
    await master.patientAuthChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new PhrError(401, "Código OTP incorrecto");
  }

  await master.patientAuthChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  const patient = await master.pacienteMaster.upsert({
    where: { phoneE164: input.phoneE164 },
    create: { phoneE164: input.phoneE164, nombre: "Paciente", otpVerificadoAt: new Date() },
    update: { otpVerificadoAt: new Date() },
  });

  let deviceTrusted = false;
  if (input.deviceFingerprint) {
    const trustedUntil = input.recordarDispositivo
      ? new Date(Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000)
      : null;
    deviceTrusted = Boolean(trustedUntil);
    await master.patientLogin.upsert({
      where: {
        patientId_deviceFingerprint: {
          patientId: patient.id,
          deviceFingerprint: input.deviceFingerprint,
        },
      },
      create: {
        patientId: patient.id,
        deviceFingerprint: input.deviceFingerprint,
        otpMethod: challenge.method,
        lastOtpSentAt: challenge.createdAt,
        lastLoginAt: new Date(),
        ...(input.deviceName !== undefined ? { deviceName: input.deviceName } : {}),
        ...(trustedUntil ? { deviceTrustedUntil: trustedUntil } : {}),
        ...(input.ip !== undefined ? { lastLoginIp: input.ip } : {}),
      },
      update: {
        lastLoginAt: new Date(),
        otpMethod: challenge.method,
        ...(trustedUntil ? { deviceTrustedUntil: trustedUntil } : {}),
        ...(input.ip !== undefined ? { lastLoginIp: input.ip } : {}),
      },
    });
  }

  return { patient, deviceTrusted };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log (LFPDPPP/ARCO) — toda lectura del PHR escribe aquí
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditInput {
  patientId: string;
  subjectId?: string;
  tenantId?: string | undefined;
  actorType: "patient" | "tenant_user" | "system";
  userId?: string | undefined;
  action:
    | "viewed_summary"
    | "viewed_record"
    | "created_record"
    | "modified_record"
    | "shared_record"
    | "exported_data";
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  reason?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export async function registrarAudit(master: MasterPrismaClient, input: AuditInput): Promise<void> {
  await master.patientAuditLog.create({
    data: {
      patientId: input.patientId,
      subjectId: input.subjectId ?? input.patientId,
      actorType: input.actorType,
      action: input.action,
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.ip !== undefined ? { ipAddress: input.ip } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceso familiar — el tutor accede al expediente del dependiente según scope
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_PERMITE_LECTURA: Record<string, boolean> = {
  full: true,
  view_only: true,
  agendar_only: false,
  custom: false,
};

/**
 * Valida que `requesterId` puede acceder al expediente de `subjectId`. Acceso
 * propio siempre permitido; ajeno solo vía PatientFamily con consent aceptado y
 * scope que permite lectura (full/view_only o custom con phr_read en detalles).
 */
export async function assertPuedeLeerSujeto(
  master: MasterPrismaClient,
  requesterId: string,
  subjectId: string,
): Promise<void> {
  if (requesterId === subjectId) return;
  const lazo = await master.patientFamily.findUnique({
    where: { dependienteId_tutorId: { dependienteId: subjectId, tutorId: requesterId } },
  });
  if (!lazo) throw new PhrError(403, "No tienes acceso al expediente de este dependiente");
  if (lazo.consentRequiredFromDependent && lazo.consentStatus !== "accepted") {
    throw new PhrError(403, "El dependiente aún no acepta tu acceso a su expediente");
  }
  if (lazo.validUntil && lazo.validUntil < new Date()) {
    throw new PhrError(403, "Tu acceso a este expediente expiró");
  }
  const detalles = (lazo.permissionDetails as { phrRead?: boolean } | null) ?? {};
  const permite =
    SCOPE_PERMITE_LECTURA[lazo.permissionScope] ||
    (lazo.permissionScope === "custom" && detalles.phrRead === true);
  if (!permite) throw new PhrError(403, "Tu nivel de acceso no permite ver el expediente");
}

// ─────────────────────────────────────────────────────────────────────────────
// Expediente unificado cross-tenant (lectura)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpedienteFiltros {
  resourceType?: FhirResourceType | undefined;
  tenantId?: string | undefined;
}

export async function getExpedienteUnificado(
  master: MasterPrismaClient,
  requesterId: string,
  subjectId: string,
  filtros: ExpedienteFiltros,
  audit: { ip?: string | undefined; userAgent?: string | undefined },
): Promise<PatientRecord[]> {
  await assertPuedeLeerSujeto(master, requesterId, subjectId);
  const where: Record<string, unknown> = { patientId: subjectId, isVisibleToPatient: true };
  if (filtros.resourceType) where.resourceType = filtros.resourceType;
  if (filtros.tenantId) where.tenantId = filtros.tenantId;
  const records = await master.patientRecord.findMany({
    where,
    orderBy: { effectiveDate: "desc" },
  });
  await registrarAudit(master, {
    patientId: requesterId,
    subjectId,
    actorType: "patient",
    action: "viewed_record",
    ...(audit.ip !== undefined ? { ip: audit.ip } : {}),
    ...(audit.userAgent !== undefined ? { userAgent: audit.userAgent } : {}),
  });
  return records;
}

export interface DatosCriticos {
  bloodType: string | null;
  alergias: PatientRecord[];
  condicionesCronicas: PatientRecord[];
  medicacionActiva: PatientRecord[];
}

export async function getDatosCriticos(
  master: MasterPrismaClient,
  requesterId: string,
  subjectId: string,
): Promise<DatosCriticos> {
  await assertPuedeLeerSujeto(master, requesterId, subjectId);
  const paciente = await master.pacienteMaster.findUniqueOrThrow({ where: { id: subjectId } });
  const records = await master.patientRecord.findMany({
    where: { patientId: subjectId, isVisibleToPatient: true, isCritical: true },
    orderBy: { effectiveDate: "desc" },
  });
  return {
    bloodType: paciente.bloodType,
    alergias: records.filter((r) => r.resourceType === "AllergyIntolerance"),
    condicionesCronicas: records.filter((r) => r.resourceType === "Condition"),
    medicacionActiva: records.filter((r) => r.resourceType === "MedicationRequest"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consentimientos
// ─────────────────────────────────────────────────────────────────────────────

export async function listarConsents(
  master: MasterPrismaClient,
  patientId: string,
): Promise<PatientConsent[]> {
  return master.patientConsent.findMany({
    where: { patientId },
    orderBy: { grantedAt: "desc" },
  });
}

export async function otorgarConsent(
  master: MasterPrismaClient,
  input: {
    patientId: string;
    subjectId?: string | undefined;
    tenantId: string;
    scope: ConsentScope;
    ip?: string | undefined;
  },
): Promise<PatientConsent> {
  const subjectId = input.subjectId ?? input.patientId;
  if (subjectId !== input.patientId) {
    await assertPuedeLeerSujeto(master, input.patientId, subjectId);
  }
  // máx 1 consent activo por (subjectType, subjectId, tenantId)
  await master.patientConsent.updateMany({
    where: { subjectId, tenantId: input.tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return master.patientConsent.create({
    data: {
      patientId: input.patientId,
      subjectId,
      tenantId: input.tenantId,
      scope: input.scope,
      ...(input.ip !== undefined ? { ipAtGrant: input.ip } : {}),
    },
  });
}

export async function revocarConsent(
  master: MasterPrismaClient,
  patientId: string,
  consentId: string,
): Promise<PatientConsent> {
  const consent = await master.patientConsent.findUnique({ where: { id: consentId } });
  if (!consent || consent.patientId !== patientId) {
    throw new PhrError(404, "Consentimiento no encontrado");
  }
  if (!consent.revocable) throw new PhrError(409, "Este consentimiento no es revocable");
  if (consent.revokedAt) return consent;
  return master.patientConsent.update({
    where: { id: consentId },
    data: { revokedAt: new Date() },
  });
}

const SCOPE_CUBRE: Record<ConsentScope, FhirResourceType[] | "*"> = {
  full_phr: "*",
  appointments_only: ["Encounter"],
  prescriptions_only: ["MedicationRequest"],
  vaccines_only: ["Immunization"],
};

function consentCubreResource(scope: ConsentScope, resourceType: FhirResourceType): boolean {
  const cubre = SCOPE_CUBRE[scope];
  return cubre === "*" || cubre.includes(resourceType);
}

/**
 * Consent activo del tenant sobre el sujeto cuyo scope cubre el resourceType.
 */
async function consentActivoQueCubre(
  master: MasterPrismaClient,
  subjectId: string,
  tenantId: string,
  resourceType: FhirResourceType,
): Promise<PatientConsent | null> {
  const consents = await master.patientConsent.findMany({
    where: { subjectId, tenantId, revokedAt: null },
  });
  return consents.find((c) => consentCubreResource(c.scope, resourceType)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión familiar
// ─────────────────────────────────────────────────────────────────────────────

export async function listarFamilia(
  master: MasterPrismaClient,
  tutorId: string,
): Promise<PatientFamily[]> {
  return master.patientFamily.findMany({
    where: { tutorId },
    include: {
      dependiente: { select: { id: true, nombre: true, apellidos: true, birthDate: true } },
    },
  });
}

export interface AgregarDependienteInput {
  tutorId: string;
  relationshipType:
    | "mother"
    | "father"
    | "legal_guardian"
    | "spouse"
    | "caregiver"
    | "sibling"
    | "other";
  permissionScope?: "full" | "view_only" | "agendar_only" | "custom" | undefined;
  // crear menor (tutor legal) — sin teléfono propio
  nuevoDependiente?:
    | { nombre: string; apellidos?: string | undefined; birthDate?: string | undefined }
    | undefined;
  // vincular adulto existente por teléfono (requiere su consentimiento)
  dependientePhone?: string | undefined;
}

export async function agregarDependiente(
  master: MasterPrismaClient,
  input: AgregarDependienteInput,
): Promise<PatientFamily> {
  let dependienteId: string;
  let consentRequired = false;

  if (input.nuevoDependiente) {
    const dep = await master.pacienteMaster.create({
      data: {
        nombre: input.nuevoDependiente.nombre,
        ...(input.nuevoDependiente.apellidos !== undefined
          ? { apellidos: input.nuevoDependiente.apellidos }
          : {}),
        ...(input.nuevoDependiente.birthDate !== undefined
          ? { birthDate: new Date(input.nuevoDependiente.birthDate) }
          : {}),
      },
    });
    dependienteId = dep.id;
  } else if (input.dependientePhone) {
    const dep = await master.pacienteMaster.findUnique({
      where: { phoneE164: input.dependientePhone },
    });
    if (!dep) throw new PhrError(404, "No existe un paciente con ese teléfono");
    dependienteId = dep.id;
    consentRequired = true; // adulto: requiere su confirmación
  } else {
    throw new PhrError(400, "Debes crear un dependiente o vincular uno por teléfono");
  }

  if (dependienteId === input.tutorId) {
    throw new PhrError(400, "No puedes agregarte a ti mismo como dependiente");
  }
  const existente = await master.patientFamily.findUnique({
    where: { dependienteId_tutorId: { dependienteId, tutorId: input.tutorId } },
  });
  if (existente) throw new PhrError(409, "Ya existe un lazo familiar con este dependiente");

  return master.patientFamily.create({
    data: {
      dependienteId,
      tutorId: input.tutorId,
      relationshipType: input.relationshipType,
      permissionScope: input.permissionScope ?? "full",
      consentRequiredFromDependent: consentRequired,
      consentStatus: consentRequired ? "pending" : "accepted",
      ...(consentRequired ? {} : { consentAcceptedAt: new Date() }),
    },
  });
}

export async function actualizarPermisosFamilia(
  master: MasterPrismaClient,
  tutorId: string,
  lazoId: string,
  input: {
    permissionScope?: "full" | "view_only" | "agendar_only" | "custom" | undefined;
    permissionDetails?: object | undefined;
    validUntil?: string | undefined;
  },
): Promise<PatientFamily> {
  const lazo = await master.patientFamily.findUnique({ where: { id: lazoId } });
  if (!lazo || lazo.tutorId !== tutorId) throw new PhrError(404, "Lazo familiar no encontrado");
  return master.patientFamily.update({
    where: { id: lazoId },
    data: {
      ...(input.permissionScope !== undefined ? { permissionScope: input.permissionScope } : {}),
      ...(input.permissionDetails !== undefined
        ? { permissionDetails: input.permissionDetails }
        : {}),
      ...(input.validUntil !== undefined ? { validUntil: new Date(input.validUntil) } : {}),
    },
  });
}

export async function eliminarDependiente(
  master: MasterPrismaClient,
  tutorId: string,
  lazoId: string,
): Promise<void> {
  const lazo = await master.patientFamily.findUnique({ where: { id: lazoId } });
  if (!lazo || lazo.tutorId !== tutorId) throw new PhrError(404, "Lazo familiar no encontrado");
  await master.patientFamily.delete({ where: { id: lazoId } });
}

// ─────────────────────────────────────────────────────────────────────────────
// QR de emergencia (Apple Health Medical ID)
// ─────────────────────────────────────────────────────────────────────────────

const EMERGENCY_FIELDS = [
  "blood_type",
  "allergies_critical",
  "chronic_conditions",
  "current_medications",
  "emergency_contact",
] as const;

export async function generarEmergencyQr(
  master: MasterPrismaClient,
  patientId: string,
  visibleFields: string[],
): Promise<PatientEmergencyQr> {
  const fields = visibleFields.filter((f) => (EMERGENCY_FIELDS as readonly string[]).includes(f));
  const qrToken = randomBytes(16).toString("hex");
  return master.patientEmergencyQr.upsert({
    where: { patientId },
    create: { patientId, qrToken, visibleFields: fields, isActive: true },
    update: { qrToken, visibleFields: fields, isActive: true, regeneratedAt: new Date() },
  });
}

export interface EmergencyQrPublico {
  nombre: string;
  bloodType?: string | null;
  allergiesCritical?: string[];
  chronicConditions?: string[];
  currentMedications?: string[];
  emergencyContact?: unknown;
}

export async function getEmergencyQrPublico(
  master: MasterPrismaClient,
  qrToken: string,
): Promise<EmergencyQrPublico> {
  const qr = await master.patientEmergencyQr.findUnique({
    where: { qrToken },
    include: { patient: true },
  });
  if (!qr || !qr.isActive) throw new PhrError(404, "QR de emergencia no válido");
  const fields = (qr.visibleFields as string[]) ?? [];
  const out: EmergencyQrPublico = { nombre: qr.patient.preferredName ?? qr.patient.nombre };

  if (fields.includes("blood_type")) out.bloodType = qr.patient.bloodType;
  if (fields.includes("emergency_contact")) {
    out.emergencyContact =
      (qr.patient.metadata as { emergencyContact?: unknown } | null)?.emergencyContact ?? null;
  }
  if (
    fields.includes("allergies_critical") ||
    fields.includes("chronic_conditions") ||
    fields.includes("current_medications")
  ) {
    const records = await master.patientRecord.findMany({
      where: { patientId: qr.patient.id, isCritical: true, isVisibleToPatient: true },
    });
    const summaries = (rt: FhirResourceType) =>
      records
        .filter((r) => r.resourceType === rt)
        .map((r) => r.summaryText ?? r.resourceSubtype ?? "");
    if (fields.includes("allergies_critical"))
      out.allergiesCritical = summaries("AllergyIntolerance");
    if (fields.includes("chronic_conditions")) out.chronicConditions = summaries("Condition");
    if (fields.includes("current_medications"))
      out.currentMedications = summaries("MedicationRequest");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export ARCO (portabilidad de datos)
// ─────────────────────────────────────────────────────────────────────────────

export async function exportarDatosArco(
  master: MasterPrismaClient,
  patientId: string,
): Promise<object> {
  const [patient, records, consents, familia, audit] = await Promise.all([
    master.pacienteMaster.findUniqueOrThrow({ where: { id: patientId } }),
    master.patientRecord.findMany({ where: { patientId }, orderBy: { effectiveDate: "desc" } }),
    master.patientConsent.findMany({ where: { patientId } }),
    master.patientFamily.findMany({ where: { tutorId: patientId } }),
    master.patientAuditLog.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  await registrarAudit(master, {
    patientId,
    actorType: "patient",
    action: "exported_data",
    reason: "Solicitud ARCO de portabilidad",
  });
  return {
    exportedAt: new Date().toISOString(),
    formato: "JSON (FHIR R4 en records.data)",
    patient,
    records,
    consents,
    familia,
    audit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Puente clínica → PHR (tenant publica/lee con consent)
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicarRegistroInput {
  patientId: string;
  tenantId: string;
  createdByUserId: string;
  resourceType: FhirResourceType;
  resourceSubtype?: string | undefined;
  effectiveDate?: string | undefined;
  data: object;
  summaryText?: string | undefined;
  isCritical?: boolean | undefined;
  isVisibleToPatient?: boolean | undefined;
}

export async function publicarRegistro(
  master: MasterPrismaClient,
  input: PublicarRegistroInput,
): Promise<PatientRecord> {
  const paciente = await master.pacienteMaster.findUnique({ where: { id: input.patientId } });
  if (!paciente) throw new PhrError(404, "Paciente no encontrado");
  const consent = await consentActivoQueCubre(
    master,
    input.patientId,
    input.tenantId,
    input.resourceType,
  );
  if (!consent) {
    throw new PhrError(
      403,
      "El paciente no ha otorgado consentimiento que cubra este tipo de registro",
    );
  }
  const record = await master.patientRecord.create({
    data: {
      patientId: input.patientId,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      resourceType: input.resourceType,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : new Date(),
      data: input.data,
      isCritical: input.isCritical ?? false,
      isVisibleToPatient: input.isVisibleToPatient ?? true,
      ...(input.resourceSubtype !== undefined ? { resourceSubtype: input.resourceSubtype } : {}),
      ...(input.summaryText !== undefined ? { summaryText: input.summaryText } : {}),
    },
  });
  await registrarAudit(master, {
    patientId: input.patientId,
    tenantId: input.tenantId,
    actorType: "tenant_user",
    userId: input.createdByUserId,
    action: "created_record",
    resourceType: input.resourceType,
    resourceId: record.id,
  });
  return record;
}

export async function registrarConsentimientoTenant(
  master: MasterPrismaClient,
  input: { patientId: string; tenantId: string; scope: ConsentScope; userId: string; ip?: string },
): Promise<PatientConsent> {
  const paciente = await master.pacienteMaster.findUnique({ where: { id: input.patientId } });
  if (!paciente) throw new PhrError(404, "Paciente no encontrado");
  await master.patientConsent.updateMany({
    where: { subjectId: input.patientId, tenantId: input.tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return master.patientConsent.create({
    data: {
      patientId: input.patientId,
      subjectId: input.patientId,
      tenantId: input.tenantId,
      scope: input.scope,
      ...(input.ip !== undefined ? { ipAtGrant: input.ip } : {}),
    },
  });
}

export async function leerExpedienteTenant(
  master: MasterPrismaClient,
  input: { patientId: string; tenantId: string; userId: string; ip?: string; userAgent?: string },
): Promise<PatientRecord[]> {
  const consents = await master.patientConsent.findMany({
    where: { subjectId: input.patientId, tenantId: input.tenantId, revokedAt: null },
  });
  if (consents.length === 0) {
    throw new PhrError(403, "El paciente no ha otorgado consentimiento a este consultorio");
  }
  const cubreTodo = consents.some((c) => c.scope === "full_phr");
  const tiposPermitidos = consents
    .flatMap((c) =>
      SCOPE_CUBRE[c.scope] === "*" ? [] : (SCOPE_CUBRE[c.scope] as FhirResourceType[]),
    )
    .filter((t, i, arr) => arr.indexOf(t) === i);

  const where: Record<string, unknown> = { patientId: input.patientId };
  if (!cubreTodo) where.resourceType = { in: tiposPermitidos };

  const records = await master.patientRecord.findMany({
    where,
    orderBy: { effectiveDate: "desc" },
  });
  await registrarAudit(master, {
    patientId: input.patientId,
    tenantId: input.tenantId,
    actorType: "tenant_user",
    userId: input.userId,
    action: "viewed_record",
    ...(input.ip !== undefined ? { ip: input.ip } : {}),
    ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
  });
  return records;
}

export async function listarAudit(
  master: MasterPrismaClient,
  patientId: string,
): Promise<Awaited<ReturnType<MasterPrismaClient["patientAuditLog"]["findMany"]>>> {
  return master.patientAuditLog.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getPacienteSelf(
  master: MasterPrismaClient,
  patientId: string,
): Promise<PacienteMaster> {
  return master.pacienteMaster.findUniqueOrThrow({ where: { id: patientId } });
}

export async function actualizarPerfilSelf(
  master: MasterPrismaClient,
  patientId: string,
  input: {
    nombre?: string | undefined;
    apellidos?: string | undefined;
    preferredName?: string | undefined;
    email?: string | undefined;
    birthDate?: string | undefined;
    bloodType?: string | undefined;
    metadata?: object | undefined;
  },
): Promise<PacienteMaster> {
  return master.pacienteMaster.update({
    where: { id: patientId },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.apellidos !== undefined ? { apellidos: input.apellidos } : {}),
      ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.birthDate !== undefined ? { birthDate: new Date(input.birthDate) } : {}),
      ...(input.bloodType !== undefined ? { bloodType: input.bloodType } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}
