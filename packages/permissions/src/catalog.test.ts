import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  isKnownPermission,
  listPermissionsByCategory,
  permissionMeta,
} from "./catalog.js";

describe("catalog", () => {
  it("expone códigos únicos", () => {
    const codes = Object.values(PERMISSIONS);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("ALL_PERMISSIONS cubre todo el catálogo", () => {
    expect(ALL_PERMISSIONS.length).toBe(Object.values(PERMISSIONS).length);
  });

  it("permissionMeta retorna code+category+description para cada permiso", () => {
    for (const code of ALL_PERMISSIONS) {
      const meta = permissionMeta(code);
      expect(meta.code).toBe(code);
      expect(meta.category).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("listPermissionsByCategory agrupa correctamente", () => {
    const grouped = listPermissionsByCategory();
    expect(grouped.pos).toBeDefined();
    expect(grouped.ventas).toBeDefined();
    expect(grouped.usuarios).toBeDefined();
    const allFromGroups = Object.values(grouped).flat();
    expect(allFromGroups.length).toBe(ALL_PERMISSIONS.length);
  });

  it("isKnownPermission detecta válidos e inválidos", () => {
    expect(isKnownPermission(PERMISSIONS.POS_USAR)).toBe(true);
    expect(isKnownPermission("inexistente.permiso")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });
});
