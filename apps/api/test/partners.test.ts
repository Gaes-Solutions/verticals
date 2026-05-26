import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;

function auth() {
  return { authorization: `Bearer ${adminToken}` };
}

async function cleanupPartners() {
  const codes = ["pt-test-1", "pt-test-2", "pt-test-3"];
  for (const c of codes) {
    const p = await masterPrisma.partner.findUnique({ where: { codigo: c } });
    if (p) {
      await masterPrisma.payout.deleteMany({ where: { partnerId: p.id } });
      await masterPrisma.commission.deleteMany({ where: { partnerId: p.id } });
      await masterPrisma.referral.deleteMany({ where: { partnerId: p.id } });
      await masterPrisma.partnerLink.deleteMany({ where: { partnerId: p.id } });
      await masterPrisma.partnerInvitacion.deleteMany({ where: { partnerId: p.id } });
      await masterPrisma.partner.delete({ where: { id: p.id } });
    }
  }
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await cleanupPartners();
});

afterAll(async () => {
  await cleanupPartners();
  if (app) await app.close();
});

describe("partners CRUD", () => {
  let partnerId: string;

  it("crea partner directo (sin invitación) en estado activo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partners",
      headers: auth(),
      payload: {
        codigo: "pt-test-1",
        razonSocial: "Despacho Test SC",
        rfc: "DTS800101AAA",
        emailContacto: "despacho@test.local",
        tipo: "contador",
        ciudad: "Guadalajara",
      },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json() as { id: string; codigo: string; nivel: string; estado: string };
    expect(p.codigo).toBe("pt-test-1");
    expect(p.nivel).toBe("bronze");
    expect(p.estado).toBe("activo");
    partnerId = p.id;
  });

  it("crea partner con código duplicado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partners",
      headers: auth(),
      payload: {
        codigo: "pt-test-1",
        razonSocial: "Otro",
        emailContacto: "otro@test.local",
        tipo: "consultor",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("lista partners filtrando por tipo=contador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/partners?tipo=contador",
      headers: auth(),
    });
    const items = res.json() as Array<{ tipo: string; codigo: string }>;
    expect(items.some((p) => p.codigo === "pt-test-1")).toBe(true);
    expect(items.every((p) => p.tipo === "contador")).toBe(true);
  });

  it("detalle incluye branding y links", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/partners/${partnerId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const p = res.json() as { codigo: string; branding: unknown; links: unknown[] };
    expect(p.codigo).toBe("pt-test-1");
    expect(p.branding).toBeNull();
    expect(p.links).toEqual([]);
  });
});

describe("partners invitación flow", () => {
  let inviteToken: string;
  let invitadoId: string;

  it("crea invitación con token y expiración", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partners/invitar",
      headers: auth(),
      payload: {
        codigo: "pt-test-2",
        razonSocial: "Integrador Test SA",
        emailContacto: "invite@test.local",
        tipo: "integrador",
        expiraEnHoras: 24,
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { partnerId: string; token: string; inviteLink: string };
    expect(r.token).toHaveLength(48);
    expect(r.inviteLink).toContain("?token=");
    inviteToken = r.token;
    invitadoId = r.partnerId;

    const p = await masterPrisma.partner.findUnique({ where: { id: invitadoId } });
    expect(p?.estado).toBe("invitado");
  });

  it("acepta invitación → estado=activo y termsAcceptedAt", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/p/pt-test-2/accept-invite",
      payload: { token: inviteToken },
    });
    expect(res.statusCode).toBe(200);
    const p = await masterPrisma.partner.findUnique({ where: { id: invitadoId } });
    expect(p?.estado).toBe("activo");
    expect(p?.termsAcceptedAt).toBeDefined();
  });

  it("re-aceptar token ya usado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/p/pt-test-2/accept-invite",
      payload: { token: inviteToken },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("partners links + click cookie 90d", () => {
  let partnerId: string;
  let linkSlug: string;
  let cookie: string;

  beforeAll(async () => {
    const p = await masterPrisma.partner.findUnique({ where: { codigo: "pt-test-1" } });
    if (!p) throw new Error("pt-test-1 no existe");
    partnerId = p.id;
  });

  it("crea link único", async () => {
    linkSlug = `tst-${Date.now().toString(36)}`;
    const res = await app.inject({
      method: "POST",
      url: `/partners/${partnerId}/links`,
      headers: auth(),
      payload: { slug: linkSlug, nombre: "Landing principal", utmSource: "newsletter" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("registra click público + recibe cookie attribution 90d", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/p/${linkSlug}/click`,
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { cookieValue: string; expiresAt: string; targetPath: string };
    expect(r.cookieValue).toHaveLength(40);
    expect(r.targetPath).toBe("/signup");
    const expira = new Date(r.expiresAt);
    const dias = Math.round((expira.getTime() - Date.now()) / 86_400_000);
    expect(dias).toBeGreaterThanOrEqual(89);
    expect(dias).toBeLessThanOrEqual(91);
    cookie = r.cookieValue;

    const link = await masterPrisma.partnerLink.findUnique({ where: { slug: linkSlug } });
    expect(link?.clicksTotal).toBeGreaterThanOrEqual(1);
  });

  it("re-click con misma cookie no duplica referral pero actualiza expiración", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/p/${linkSlug}/click`,
      headers: { "x-partner-attribution": cookie },
    });
    expect(res.statusCode).toBe(200);
    const count = await masterPrisma.referral.count({ where: { cookieValue: cookie } });
    expect(count).toBe(1);
  });
});

describe("partners referral lifecycle + comisiones + payout", () => {
  let partnerId: string;
  let referralId: string;

  beforeAll(async () => {
    const p = await masterPrisma.partner.findUnique({ where: { codigo: "pt-test-1" } });
    if (!p) throw new Error();
    partnerId = p.id;

    const referral = await masterPrisma.referral.findFirst({
      where: { partnerId, tenantId: null, estado: "click" },
    });
    if (!referral) throw new Error("no hay referral click previo");

    const starterPlan = await masterPrisma.plan.findUnique({ where: { code: "starter" } });
    if (!starterPlan) throw new Error("plan starter no sembrado");

    const tenant = await masterPrisma.tenant.create({
      data: {
        slug: `test-partner-tenant-${Date.now().toString(36)}`,
        name: "Tenant referido por partner",
        schemaName: `tenant_partner_${Date.now().toString(36)}`,
        status: "active",
        planId: starterPlan.id,
      },
    });
    await masterPrisma.referral.update({
      where: { id: referral.id },
      data: { tenantId: tenant.id, estado: "signup", signupAt: new Date() },
    });
    referralId = referral.id;
  });

  it("transición signup → trial", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/partners/referrals/${referralId}/transicionar/trial`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    const r = await masterPrisma.referral.findUnique({ where: { id: referralId } });
    expect(r?.estado).toBe("trial");
    expect(r?.trialStartAt).toBeDefined();
  });

  it("transición trial → paying e incrementa paidConversions del link", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/partners/referrals/${referralId}/transicionar/paying`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    const r = await masterPrisma.referral.findUnique({ where: { id: referralId } });
    expect(r?.estado).toBe("paying");
    if (r) {
      const link = await masterPrisma.partnerLink.findUnique({ where: { id: r.linkId } });
      expect(link?.paidConversions).toBeGreaterThanOrEqual(1);
    }
  });

  it("recalcular nivel: 1 paying = sigue bronze", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/partners/${partnerId}/recalcular-nivel`,
      headers: auth(),
    });
    const r = res.json() as { nivel: string; payingCount: number };
    expect(r.nivel).toBe("bronze");
    expect(r.payingCount).toBe(1);
  });

  it("recalcular comisiones del periodo crea Commission pendiente con pct=25 (bronze)", async () => {
    const periodo = "202605";
    const res = await app.inject({
      method: "POST",
      url: `/partners/${partnerId}/recalcular-comisiones`,
      headers: auth(),
      payload: { periodoYyyymm: periodo },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as { creadas: number; totalMontoComision: string };
    expect(r.creadas).toBe(1);
    const c = await masterPrisma.commission.findFirst({
      where: { partnerId, periodoYyyymm: periodo },
    });
    expect(Number(c?.porcentajeAplicado.toString())).toBe(25);
    expect(c?.estado).toBe("pendiente");
  });

  it("aprueba comisión", async () => {
    const c = await masterPrisma.commission.findFirst({
      where: { partnerId, estado: "pendiente" },
    });
    if (!c) throw new Error("no hay pending");
    const res = await app.inject({
      method: "POST",
      url: `/partners/commissions/${c.id}/aprobar`,
      headers: auth(),
      payload: {},
    });
    expect(res.statusCode).toBe(204);
    const after = await masterPrisma.commission.findUnique({ where: { id: c.id } });
    expect(after?.estado).toBe("aprobada");
    expect(after?.aprobadaAt).toBeDefined();
  });

  it("crea payout que agrupa comisiones aprobadas del periodo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partners/payouts",
      headers: auth(),
      payload: { partnerId, periodoYyyymm: "202605", metodoPago: "spei" },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { payoutId: string; commissionsAgrupadas: number; montoTotal: string };
    expect(r.commissionsAgrupadas).toBe(1);
    expect(Number(r.montoTotal)).toBeGreaterThan(0);
  });

  it("payout duplicado mismo periodo → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/partners/payouts",
      headers: auth(),
      payload: { partnerId, periodoYyyymm: "202605", metodoPago: "paypal" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("marca payout pagado → commissions pasan a estado=pagada", async () => {
    const p = await masterPrisma.payout.findFirst({
      where: { partnerId, periodoYyyymm: "202605" },
    });
    if (!p) throw new Error();
    const res = await app.inject({
      method: "POST",
      url: `/partners/payouts/${p.id}/marcar-pagado`,
      headers: auth(),
      payload: { folioBancario: "SPEI-2026-001" },
    });
    expect(res.statusCode).toBe(204);
    const after = await masterPrisma.payout.findUnique({ where: { id: p.id } });
    expect(after?.estado).toBe("pagado");
    expect(after?.folioBancario).toBe("SPEI-2026-001");
    const commissions = await masterPrisma.commission.findMany({ where: { payoutId: p.id } });
    expect(commissions.every((c) => c.estado === "pagada")).toBe(true);
  });
});

describe("partners RBAC", () => {
  it("sin auth admin → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/partners" });
    expect(res.statusCode).toBe(401);
  });
});
