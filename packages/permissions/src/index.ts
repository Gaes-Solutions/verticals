export {
  ALL_PERMISSIONS,
  PERMISSIONS,
  isKnownPermission,
  listPermissionsByCategory,
  permissionMeta,
} from "./catalog.js";
export type { PermissionCode, PermissionMeta } from "./catalog.js";

export {
  PermissionDeniedError,
  hasAnyPermission,
  hasPermission,
  mergeRolePermissions,
  requirePermission,
} from "./check.js";
export type { PermissionPrincipal } from "./check.js";

export { PRESET_ROLES_RETAIL } from "./preset-roles.js";
export type { PresetRole } from "./preset-roles.js";
