export { masterPrisma, createMasterClient } from "./client.js";
export type { MasterPrismaClient } from "./client.js";
export { Prisma } from "./generated/master/index.js";
export type {
  AdminRole,
  AdminUser,
  AuditLog,
  Plan,
  RefreshToken,
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
