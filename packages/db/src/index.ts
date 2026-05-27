export { masterPrisma, createMasterClient } from "./client.js";
export type { MasterPrismaClient } from "./client.js";
export { Prisma } from "./generated/master/index.js";
export type {
  AdminRole,
  AdminUser,
  AuditLog,
  ConsentScope,
  ConsentSubjectType,
  FamilyConsentStatus,
  FamilyPermissionScope,
  FamilyRelationship,
  FhirResourceType,
  PacienteMaster,
  PatientAuditLog,
  PatientConsent,
  PatientEmergencyQr,
  PatientFamily,
  PatientLogin,
  PatientRecord,
  PatientRecordStatus,
  PatientSexAtBirth,
  PhrAuditAction,
  PhrAuditActorType,
  Plan,
  ProfesionalStatus,
  ProfesionalTipo,
  PublicProfessional,
  PublicProfessionalLocation,
  PublicProfessionalSearchIndex,
  PublicReview,
  RefreshToken,
  ReviewModeracionStatus,
  Tenant,
  TenantStatus,
} from "./generated/master/index.js";
export {
  createTenant,
  listTenants,
  migrateAllTenants,
  migrateTenant,
} from "./cli/tenant.js";
export type { CreateTenantOptions } from "./cli/tenant.js";
export { tenantSchemaName, validateSlug } from "./cli/utils.js";
export {
  createTenantClient,
  disconnectAllTenantClients,
  disconnectTenantClient,
  getTenantClient,
} from "./tenant-client.js";
export type { TenantPrismaClient } from "./tenant-client.js";
export {
  seedAllTenantDefaults,
  seedTenantDefaults,
} from "./seed-tenant.js";
export type {
  SeedTenantDefaultsOptions,
  SeedTenantDefaultsResult,
} from "./seed-tenant.js";
