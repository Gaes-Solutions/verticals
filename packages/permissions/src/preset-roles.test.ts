import { describe, expect, it } from "vitest";
import { isKnownPermission } from "./catalog.js";
import { PRESET_ROLES_RETAIL } from "./preset-roles.js";

describe("PRESET_ROLES_RETAIL", () => {
  it("códigos son únicos", () => {
    const codes = PRESET_ROLES_RETAIL.map((r) => r.codigo);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("incluye los roles base retail", () => {
    const codes = PRESET_ROLES_RETAIL.map((r) => r.codigo);
    expect(codes).toEqual(
      expect.arrayContaining([
        "dueno",
        "gerente",
        "cajero",
        "vendedor",
        "almacen",
        "contador_interno",
      ]),
    );
  });

  it("dueno tiene wildcard", () => {
    const dueno = PRESET_ROLES_RETAIL.find((r) => r.codigo === "dueno");
    expect(dueno?.permisos).toEqual(["*"]);
  });

  it("cada permiso (excepto '*') es un código conocido del catálogo", () => {
    for (const role of PRESET_ROLES_RETAIL) {
      for (const p of role.permisos) {
        if (p === "*") continue;
        expect(isKnownPermission(p), `rol=${role.codigo} permiso=${p}`).toBe(true);
      }
    }
  });

  it("cajero tiene POS y caja pero NO descuentos altos ni CFDI cancelar", () => {
    const cajero = PRESET_ROLES_RETAIL.find((r) => r.codigo === "cajero");
    expect(cajero).toBeDefined();
    const permisos = cajero?.permisos ?? [];
    expect(permisos).toContain("pos.usar");
    expect(permisos).toContain("caja.abrir");
    expect(permisos).toContain("caja.cerrar");
    expect(permisos).not.toContain("ventas.aplicar_descuento_alto");
    expect(permisos).not.toContain("cfdi.cancelar");
  });
});
