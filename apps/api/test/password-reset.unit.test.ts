import { renderPlantilla } from "@gaespos/email";
import { describe, expect, it } from "vitest";
import {
  RESET_EXPIRA_MS,
  estadoReset,
  generarResetToken,
  hashResetToken,
  olvidarContrasenaSchema,
  restablecerContrasenaSchema,
} from "../src/modules/cliente-portal/password-reset-service.js";

// Lógica pura de recuperación de contraseña (sin DB): hash del token, estado
// vigente/usado/expirado, schemas de entrada y render de la plantilla de email.

describe("hashResetToken", () => {
  it("es sha256 en hex del token (persistimos solo esto)", () => {
    expect(hashResetToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("es determinista y distinto entre tokens", () => {
    const a = generarResetToken();
    const b = generarResetToken();
    expect(hashResetToken(a)).toBe(hashResetToken(a));
    expect(hashResetToken(a)).not.toBe(hashResetToken(b));
  });
});

describe("generarResetToken", () => {
  it("genera 64 caracteres hex (32 bytes) y nunca repite", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generarResetToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("estadoReset", () => {
  const base = { usadoEn: null, expiraEn: new Date("2026-09-22T12:00:00Z") };

  it("vigente antes de la expiración", () => {
    expect(estadoReset(base, new Date("2026-09-22T11:59:59Z"))).toBe("vigente");
  });

  it("expirado en el instante de expiración y después (ventana de 1h)", () => {
    expect(estadoReset(base, new Date("2026-09-22T12:00:00Z"))).toBe("expirado");
    expect(estadoReset(base, new Date("2026-09-23T12:00:00Z"))).toBe("expirado");
    expect(RESET_EXPIRA_MS).toBe(3_600_000);
  });

  it("usado manda sobre expirado (un solo uso, aunque aún no venza)", () => {
    expect(
      estadoReset(
        { usadoEn: new Date("2026-09-22T11:00:00Z"), expiraEn: new Date("2026-09-22T12:00:00Z") },
        new Date("2026-09-22T11:30:00Z"),
      ),
    ).toBe("usado");
  });
});

describe("schemas de recuperación", () => {
  it("olvidar: exige tenantSlug + email válido", () => {
    expect(
      olvidarContrasenaSchema.safeParse({ tenantSlug: "mi-tienda", email: "A@B.MX" }).success,
    ).toBe(true);
    expect(
      olvidarContrasenaSchema.safeParse({ tenantSlug: "mi-tienda", email: "no" }).success,
    ).toBe(false);
    expect(olvidarContrasenaSchema.safeParse({ email: "a@b.mx" }).success).toBe(false);
  });

  it("restablecer: password con la misma regla del registro (mín. 8) y token acotado", () => {
    const ok = restablecerContrasenaSchema.safeParse({
      tenantSlug: "mi-tienda",
      token: "a".repeat(64),
      nuevaContrasena: "nuevaClave9",
    });
    expect(ok.success).toBe(true);
    expect(
      restablecerContrasenaSchema.safeParse({
        tenantSlug: "mi-tienda",
        token: "a".repeat(64),
        nuevaContrasena: "corta1",
      }).success,
    ).toBe(false);
    expect(
      restablecerContrasenaSchema.safeParse({
        tenantSlug: "mi-tienda",
        token: "corto",
        nuevaContrasena: "nuevaClave9",
      }).success,
    ).toBe(false);
  });
});

describe("plantilla recuperar_contrasena", () => {
  it("incluye el enlace completo con el token", () => {
    const url = "https://mitienda.stores.gaessoft.mx/cuenta/restablecer?token=tok123";
    const r = renderPlantilla("recuperar_contrasena", { url });
    expect(r.asunto.toLowerCase()).toContain("contraseña");
    expect(r.html).toContain(url);
    expect(r.texto).toContain("tok123");
  });
});
