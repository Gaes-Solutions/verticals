import { describe, expect, it } from "vitest";
import { validarIdentidadAdmin } from "../src/lib/admin-identity.js";
const identity = {
  id: "user-a",
  nombre: "Persona",
  tenantSlug: "negocio",
  permissions: ["productos.leer"],
};
describe("verified administrator identity", () => {
  it("accepts a real identity and a string permission list without coercion", () => {
    expect(validarIdentidadAdmin(identity)).toEqual(identity);
    expect(validarIdentidadAdmin({ ...identity, permissions: [] }).permissions).toEqual([]);
  });
  it.each([
    null,
    [],
    {},
    { ...identity, id: 3 },
    { ...identity, id: " " },
    { ...identity, nombre: {} },
    { ...identity, nombre: "" },
    { ...identity, tenantSlug: null },
    { ...identity, tenantSlug: " " },
    { ...identity, permissions: "*" },
    { ...identity, permissions: {} },
    { ...identity, permissions: ["*", 7] },
    { ...identity, permissions: [null] },
  ])("rejects malformed account data before it can enter the session", (value) => {
    expect(() => validarIdentidadAdmin(value)).toThrow("información de tu acceso no es válida");
  });
});
