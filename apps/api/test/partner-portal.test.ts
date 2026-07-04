import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

const CODIGO = "pt-portal-1";
const EMAIL = "portal-partner@test.local";
const PASSWORD = "Partner!2026x";

let app: FastifyInstance;
let adminToken: string;
let inviteToken: string;
let partnerToken: string;

async function cleanup() {
  const p = await masterPrisma.partner.findUnique({ where: { codigo: CODIGO } });
  if (p) {
    await masterPrisma.payout.deleteMany({ where: { partnerId: p.id } });
    await masterPrisma.commission.deleteMany({ where: { partnerId: p.id } });
    await masterPrisma.referral.deleteMany({ where: { partnerId: p.id } });
    await masterPrisma.partnerLink.deleteMany({ where: { partnerId: p.id } });
    await masterPrisma.partnerInvitacion.deleteMany({ where: { partnerId: p.id } });
    await masterPrisma.partner.delete({ where: { id: p.id } });
  }
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await cleanup();

  const invitar = await app.inject({
    method: "POST",
    url: "/partners/invitar",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      codigo: CODIGO,
      razonSocial: "Despacho Portal SC",
      emailContacto: EMAIL,
      tipo: "contador",
    },
  });
  expect(invitar.statusCode).toBe(201);
  inviteToken = (invitar.json() as { token: string }).token;
});

afterAll(async () => {
  await cleanup();
  if (app) await app.close();
});

describe("aceptar invitación con password (ADR 013)", () => {
  it("login antes de aceptar es 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("acepta la invitación fijando password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/aceptar-invitacion",
      payload: { token: inviteToken, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().codigo).toBe(CODIGO);
    const p = await masterPrisma.partner.findUnique({ where: { codigo: CODIGO } });
    expect(p?.estado).toBe("activo");
    expect(p?.passwordHash).toBeTruthy();
  });

  it("re-aceptar es 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/aceptar-invitacion",
      payload: { token: inviteToken, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("login y sesión del partner", () => {
  it("password incorrecta es 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/login",
      payload: { email: EMAIL, password: "otra-cosa-123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login correcto entrega token y perfil", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken: string;
      partner: { codigo: string; nivel: string; comisionPct: number; mfaActivo: boolean };
    };
    expect(body.partner.codigo).toBe(CODIGO);
    expect(body.partner.nivel).toBe("bronze");
    expect(body.partner.comisionPct).toBeGreaterThan(0);
    expect(body.partner.mfaActivo).toBe(false);
    partnerToken = body.accessToken;
  });

  it("/partner/me con token de partner responde su perfil", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/partner/me",
      headers: { authorization: `Bearer ${partnerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().emailContacto).toBe(EMAIL);
  });

  it("/partner/me con token admin es 401 (kind incorrecto)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/partner/me",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("referrals, commissions y payouts responden colecciones del partner", async () => {
    const headers = { authorization: `Bearer ${partnerToken}` };
    const [refs, comms, pays] = await Promise.all([
      app.inject({ method: "GET", url: "/partner/referrals", headers }),
      app.inject({ method: "GET", url: "/partner/commissions", headers }),
      app.inject({ method: "GET", url: "/partner/payouts", headers }),
    ]);
    expect(refs.statusCode).toBe(200);
    expect(Array.isArray(refs.json())).toBe(true);
    expect(comms.statusCode).toBe(200);
    expect(Array.isArray(comms.json().items)).toBe(true);
    expect(pays.statusCode).toBe(200);
    expect(Array.isArray(pays.json())).toBe(true);
  });
});

describe("2FA TOTP opt-in del partner", () => {
  let secret: string;

  it("setup entrega secret y otpauth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/mfa/setup",
      headers: { authorization: `Bearer ${partnerToken}` },
    });
    expect(res.statusCode).toBe(200);
    secret = res.json().secret;
    expect(res.json().otpauthUrl).toContain("otpauth://");
  });

  it("activate con código válido entrega códigos de respaldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partner/auth/mfa/activate",
      headers: { authorization: `Bearer ${partnerToken}` },
      payload: { code: authenticator.generate(secret) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().backupCodes.length).toBeGreaterThanOrEqual(8);
  });

  it("con 2FA activo el login reta y verify entrega sesión", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/partner/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const reto = login.json() as { mfaRequired?: boolean; mfaToken?: string };
    expect(reto.mfaRequired).toBe(true);

    const mal = await app.inject({
      method: "POST",
      url: "/partner/auth/mfa/verify",
      headers: { authorization: `Bearer ${reto.mfaToken}` },
      payload: { code: "000000" },
    });
    expect(mal.statusCode).toBe(401);

    const bien = await app.inject({
      method: "POST",
      url: "/partner/auth/mfa/verify",
      headers: { authorization: `Bearer ${reto.mfaToken}` },
      payload: { code: authenticator.generate(secret) },
    });
    expect(bien.statusCode).toBe(200);
    expect(bien.json().accessToken).toBeTruthy();
    expect(bien.json().partner.mfaActivo).toBe(true);
  });
});
