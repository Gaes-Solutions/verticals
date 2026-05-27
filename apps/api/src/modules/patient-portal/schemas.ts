import { z } from "zod";

const phoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Teléfono debe ser formato E.164 (+521234567890)");

export const fhirResourceTypeEnum = z.enum([
  "Encounter",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "Immunization",
  "MedicationRequest",
  "DiagnosticReport",
  "Procedure",
  "CarePlan",
]);

export const consentScopeEnum = z.enum([
  "full_phr",
  "appointments_only",
  "prescriptions_only",
  "vaccines_only",
]);

export const requestOtpSchema = z.object({
  phoneE164,
  method: z.enum(["whatsapp", "sms"]).optional(),
});

export const verifyOtpSchema = z.object({
  phoneE164,
  code: z.string().regex(/^\d{6}$/, "Código de 6 dígitos"),
  deviceFingerprint: z.string().min(8).max(128).optional(),
  deviceName: z.string().max(80).optional(),
  recordarDispositivo: z.boolean().optional(),
});

export const expedienteQuerySchema = z.object({
  subjectId: z.string().min(1).optional(),
  resourceType: fhirResourceTypeEnum.optional(),
  tenantId: z.string().min(1).optional(),
});

export const subjectQuerySchema = z.object({
  subjectId: z.string().min(1).optional(),
});

export const otorgarConsentSchema = z.object({
  tenantId: z.string().min(1),
  scope: consentScopeEnum,
  subjectId: z.string().min(1).optional(),
});

export const agregarDependienteSchema = z
  .object({
    relationshipType: z.enum([
      "mother",
      "father",
      "legal_guardian",
      "spouse",
      "caregiver",
      "sibling",
      "other",
    ]),
    permissionScope: z.enum(["full", "view_only", "agendar_only", "custom"]).optional(),
    nuevoDependiente: z
      .object({
        nombre: z.string().min(2).max(120),
        apellidos: z.string().max(120).optional(),
        birthDate: z.string().date().optional(),
      })
      .optional(),
    dependientePhone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
  })
  .refine((v) => v.nuevoDependiente || v.dependientePhone, {
    message: "Debes crear un dependiente o vincular uno por teléfono",
  });

export const actualizarPermisosSchema = z.object({
  permissionScope: z.enum(["full", "view_only", "agendar_only", "custom"]).optional(),
  permissionDetails: z.record(z.string(), z.unknown()).optional(),
  validUntil: z.string().datetime().optional(),
});

export const emergencyQrSchema = z.object({
  visibleFields: z
    .array(
      z.enum([
        "blood_type",
        "allergies_critical",
        "chronic_conditions",
        "current_medications",
        "emergency_contact",
      ]),
    )
    .max(5),
});

export const actualizarPerfilSchema = z.object({
  nombre: z.string().min(2).max(120).optional(),
  apellidos: z.string().max(120).optional(),
  preferredName: z.string().max(120).optional(),
  email: z.string().email().toLowerCase().optional(),
  birthDate: z.string().date().optional(),
  bloodType: z.string().max(8).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
export const qrTokenParamSchema = z.object({ qrToken: z.string().min(8).max(64) });

// Puente clínica → PHR
export const publicarRegistroSchema = z.object({
  patientId: z.string().min(1),
  resourceType: fhirResourceTypeEnum,
  resourceSubtype: z.string().max(120).optional(),
  effectiveDate: z.string().datetime().optional(),
  data: z.record(z.string(), z.unknown()),
  summaryText: z.string().max(2000).optional(),
  isCritical: z.boolean().optional(),
  isVisibleToPatient: z.boolean().optional(),
});

export const registrarConsentTenantSchema = z.object({
  patientId: z.string().min(1),
  scope: consentScopeEnum,
});

export const patientIdParamSchema = z.object({ patientId: z.string().min(1) });
