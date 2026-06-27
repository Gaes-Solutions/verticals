import { describe, expect, it } from "vitest";
import { mascotaCreateSchema } from "../src/modules/tenant/mascotas/schemas.js";
import { pacienteCreateSchema } from "../src/modules/tenant/pacientes/schemas.js";

describe("validación microchip (mascotas)", () => {
  const base = { nombre: "Firulais", especie: "perro" as const };

  it("acepta microchip ISO de 15 dígitos", () => {
    expect(mascotaCreateSchema.safeParse({ ...base, microchip: "900123456789012" }).success).toBe(
      true,
    );
  });

  it("acepta sin microchip (opcional)", () => {
    expect(mascotaCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza microchip con letras o longitud inválida", () => {
    expect(mascotaCreateSchema.safeParse({ ...base, microchip: "ABC123" }).success).toBe(false);
    expect(mascotaCreateSchema.safeParse({ ...base, microchip: "1234" }).success).toBe(false);
  });
});

describe("validación CURP (pacientes)", () => {
  it("acepta un CURP con formato válido", () => {
    const r = pacienteCreateSchema.safeParse({ nombre: "Juan", curp: "MELM850101HJCNNN05" });
    expect(r.success).toBe(true);
  });

  it("rechaza un CURP con formato inválido", () => {
    expect(pacienteCreateSchema.safeParse({ nombre: "Juan", curp: "NOPE" }).success).toBe(false);
  });
});
