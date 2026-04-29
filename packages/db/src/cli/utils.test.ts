import { describe, expect, it } from "vitest";
import { tenantDatabaseUrl, tenantSchemaName, validateSlug } from "./utils.js";

describe("validateSlug", () => {
  it.each(["acme", "demo", "bodega-norte", "tenant1", "a-b-c", "x_y_z"])(
    "acepta slug válido: %s",
    (slug) => {
      expect(() => validateSlug(slug)).not.toThrow();
    },
  );

  it.each([
    ["", "vacío"],
    ["A", "muy corto + mayúscula"],
    ["1abc", "empieza con número"],
    ["-abc", "empieza con guión"],
    ["abc!", "carácter inválido"],
    ["abc def", "espacio"],
    ["a".repeat(60), "muy largo"],
  ])("rechaza slug inválido (%s)", (slug, _reason) => {
    expect(() => validateSlug(slug)).toThrow(/inválido/i);
  });
});

describe("tenantSchemaName", () => {
  it("genera prefijo tenant_", () => {
    expect(tenantSchemaName("acme")).toBe("tenant_acme");
  });

  it("convierte guión a underscore (postgres no acepta guiones)", () => {
    expect(tenantSchemaName("bodega-norte")).toBe("tenant_bodega_norte");
    expect(tenantSchemaName("a-b-c")).toBe("tenant_a_b_c");
  });
});

describe("tenantDatabaseUrl", () => {
  it("agrega ?schema= al URL base", () => {
    const result = tenantDatabaseUrl("postgresql://u:p@h:5432/db", "tenant_acme");
    expect(result).toContain("schema=tenant_acme");
  });

  it("sobrescribe schema existente", () => {
    const result = tenantDatabaseUrl("postgresql://u:p@h:5432/db?schema=public", "tenant_other");
    const url = new URL(result);
    expect(url.searchParams.get("schema")).toBe("tenant_other");
  });

  it("preserva otros query params", () => {
    const result = tenantDatabaseUrl("postgresql://u:p@h:5432/db?sslmode=require", "tenant_x");
    const url = new URL(result);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("schema")).toBe("tenant_x");
  });
});
