import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./catalog.js";
import {
  PermissionDeniedError,
  hasAnyPermission,
  hasPermission,
  mergeRolePermissions,
  requirePermission,
} from "./check.js";

describe("hasPermission", () => {
  it("retorna true cuando el principal tiene el permiso", () => {
    expect(
      hasPermission({ permissions: [PERMISSIONS.VENTAS_CREAR] }, PERMISSIONS.VENTAS_CREAR),
    ).toBe(true);
  });

  it("retorna false cuando no lo tiene", () => {
    expect(
      hasPermission({ permissions: [PERMISSIONS.VENTAS_LEER] }, PERMISSIONS.VENTAS_CREAR),
    ).toBe(false);
  });

  it("isOwner=true bypassa cualquier check", () => {
    expect(hasPermission({ permissions: [], isOwner: true }, PERMISSIONS.CFDI_CANCELAR)).toBe(true);
  });

  it("wildcard '*' otorga cualquier permiso", () => {
    expect(hasPermission({ permissions: ["*"] }, PERMISSIONS.CFDI_CANCELAR)).toBe(true);
  });

  it("array de requeridos exige TODOS los permisos", () => {
    const granted = [PERMISSIONS.VENTAS_LEER, PERMISSIONS.VENTAS_CREAR];
    expect(
      hasPermission({ permissions: granted }, [PERMISSIONS.VENTAS_LEER, PERMISSIONS.VENTAS_CREAR]),
    ).toBe(true);
    expect(
      hasPermission({ permissions: granted }, [PERMISSIONS.VENTAS_CREAR, PERMISSIONS.CFDI_EMITIR]),
    ).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("retorna true si tiene al menos uno", () => {
    expect(
      hasAnyPermission({ permissions: [PERMISSIONS.VENTAS_LEER] }, [
        PERMISSIONS.VENTAS_CREAR,
        PERMISSIONS.VENTAS_LEER,
      ]),
    ).toBe(true);
  });

  it("retorna false si no tiene ninguno", () => {
    expect(
      hasAnyPermission({ permissions: [PERMISSIONS.PRODUCTOS_LEER] }, [
        PERMISSIONS.VENTAS_CREAR,
        PERMISSIONS.CFDI_EMITIR,
      ]),
    ).toBe(false);
  });
});

describe("requirePermission", () => {
  it("no lanza si tiene permiso", () => {
    expect(() =>
      requirePermission({ permissions: [PERMISSIONS.VENTAS_CREAR] }, PERMISSIONS.VENTAS_CREAR),
    ).not.toThrow();
  });

  it("lanza PermissionDeniedError con statusCode 403 y missing", () => {
    try {
      requirePermission({ permissions: [] }, PERMISSIONS.VENTAS_CREAR);
      throw new Error("debió lanzar");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      const denied = err as PermissionDeniedError;
      expect(denied.statusCode).toBe(403);
      expect(denied.missing).toEqual([PERMISSIONS.VENTAS_CREAR]);
    }
  });
});

describe("mergeRolePermissions", () => {
  it("une permisos de varios roles deduplicados", () => {
    const merged = mergeRolePermissions([
      [PERMISSIONS.VENTAS_LEER, PERMISSIONS.VENTAS_CREAR],
      [PERMISSIONS.VENTAS_CREAR, PERMISSIONS.PRODUCTOS_LEER],
    ]);
    expect(merged.sort()).toEqual(
      [PERMISSIONS.VENTAS_LEER, PERMISSIONS.VENTAS_CREAR, PERMISSIONS.PRODUCTOS_LEER].sort(),
    );
  });

  it("ignora códigos desconocidos", () => {
    const merged = mergeRolePermissions([[PERMISSIONS.VENTAS_CREAR, "inventado.x"]]);
    expect(merged).toEqual([PERMISSIONS.VENTAS_CREAR]);
  });

  it("colapsa a ['*'] si algún rol trae wildcard", () => {
    const merged = mergeRolePermissions([
      [PERMISSIONS.VENTAS_LEER],
      ["*"],
      [PERMISSIONS.PRODUCTOS_LEER],
    ]);
    expect(merged).toEqual(["*"]);
  });
});
