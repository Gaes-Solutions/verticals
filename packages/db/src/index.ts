export { masterPrisma, createMasterClient } from "./client.js";
export type { MasterPrismaClient } from "./client.js";
export { Prisma } from "./generated/master/index.js";
export type {
  AdminRole,
  AdminTenantRole,
  AdminUser,
  AuditLog,
  ConsentScope,
  ConsentSubjectType,
  Coupon,
  CouponDiscountType,
  CouponDuration,
  CouponRedemption,
  FamilyConsentStatus,
  FamilyPermissionScope,
  FamilyRelationship,
  FhirResourceType,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  InvoicePaymentStatus,
  InvoiceStatus,
  PacienteMaster,
  PatientAuditLog,
  PatientConsent,
  PatientEmergencyQr,
  PatientFamily,
  PatientLogin,
  PatientRecord,
  PatientRecordStatus,
  PatientSexAtBirth,
  PaymentMethod,
  PaymentMethodType,
  PhrAuditAction,
  PhrAuditActorType,
  Plan,
  PlanFeature,
  PlanPrice,
  ProfesionalStatus,
  ProfesionalTipo,
  PublicProfessional,
  PublicProfessionalLocation,
  PublicProfessionalSearchIndex,
  PublicReview,
  RefreshToken,
  ReviewModeracionStatus,
  Subscription,
  SubscriptionInterval,
  SubscriptionItem,
  SubscriptionStatus,
  Tenant,
  TenantSettingsMaster,
  TenantStatus,
  TenantUserAdmin,
  TenantVertical,
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
export { onboardTenant } from "./onboard-tenant.js";
export type { OnboardTenantInput, OnboardTenantResult } from "./onboard-tenant.js";
export { seedRolePlantillas } from "./seed-role-plantillas.js";
export type { SeedRolePlantillasResult } from "./seed-role-plantillas.js";
export {
  aplicarPlantillasATenant,
  plantillasParaVertical,
  propagarPlantilla,
  propagarEliminacionPlantilla,
} from "./role-plantilla-sync.js";
