import { type PermissionCode, isKnownPermission } from "./catalog.js";

export interface PermissionPrincipal {
  permissions: ReadonlyArray<string>;
  isOwner?: boolean;
}

const WILDCARD = "*";

export function hasPermission(
  principal: PermissionPrincipal,
  required: PermissionCode | PermissionCode[],
): boolean {
  if (principal.isOwner === true) {
    return true;
  }
  const granted = principal.permissions;
  if (granted.includes(WILDCARD)) {
    return true;
  }
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((p) => granted.includes(p));
}

export function hasAnyPermission(
  principal: PermissionPrincipal,
  required: PermissionCode[],
): boolean {
  if (principal.isOwner === true) {
    return true;
  }
  const granted = principal.permissions;
  if (granted.includes(WILDCARD)) {
    return true;
  }
  return required.some((p) => granted.includes(p));
}

export class PermissionDeniedError extends Error {
  readonly statusCode = 403;
  readonly missing: PermissionCode[];

  constructor(missing: PermissionCode[]) {
    super(`Permiso requerido: ${missing.join(", ")}`);
    this.name = "PermissionDeniedError";
    this.missing = missing;
  }
}

export function requirePermission(
  principal: PermissionPrincipal,
  required: PermissionCode | PermissionCode[],
): void {
  if (hasPermission(principal, required)) {
    return;
  }
  const list = Array.isArray(required) ? required : [required];
  throw new PermissionDeniedError(list);
}

export function mergeRolePermissions(
  rolePermissionsArrays: ReadonlyArray<ReadonlyArray<string>>,
): PermissionCode[] {
  const acc = new Set<PermissionCode>();
  let hasWildcard = false;
  for (const role of rolePermissionsArrays) {
    for (const p of role) {
      if (p === WILDCARD) {
        hasWildcard = true;
      } else if (isKnownPermission(p)) {
        acc.add(p);
      }
    }
  }
  if (hasWildcard) {
    return [WILDCARD as unknown as PermissionCode];
  }
  return Array.from(acc);
}
