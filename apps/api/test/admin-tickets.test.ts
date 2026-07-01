import { masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAdmin } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;
const ASUNTO = "TEST-TICKET no puedo entrar";

function auth() {
  return { authorization: `Bearer ${adminToken}` };
}

async function cleanup() {
  const tickets = await masterPrisma.supportTicket.findMany({
    where: { subject: { startsWith: "TEST-TICKET" } },
    select: { id: true },
  });
  for (const t of tickets) {
    await masterPrisma.supportTicketMessage.deleteMany({ where: { ticketId: t.id } });
    await masterPrisma.supportTicket.delete({ where: { id: t.id } });
  }
}

beforeAll(async () => {
  app = await buildTestApp();
  adminToken = (await loginAdmin(app)).accessToken;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (app) await app.close();
});

describe("soporte · tickets", () => {
  let ticketId: string;

  it("crea un ticket con mensaje inicial", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/tickets",
      headers: auth(),
      payload: { subject: ASUNTO, mensaje: "El login me da error", priority: "high" },
    });
    expect(res.statusCode).toBe(201);
    const t = res.json() as { id: string; status: string; messages: unknown[] };
    expect(t.status).toBe("open");
    expect(t.messages).toHaveLength(1);
    ticketId = t.id;
  });

  it("lista incluye el ticket y filtra por prioridad", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tickets?priority=high",
      headers: auth(),
    });
    const items = res.json() as Array<{ id: string; priority: string }>;
    expect(items.some((t) => t.id === ticketId)).toBe(true);
    expect(items.every((t) => t.priority === "high")).toBe(true);
  });

  it("agrega una respuesta al hilo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticketId}/mensajes`,
      headers: auth(),
      payload: { body: "Ya lo revisamos, intenta de nuevo" },
    });
    expect(res.statusCode).toBe(201);
    const det = await app.inject({
      method: "GET",
      url: `/admin/tickets/${ticketId}`,
      headers: auth(),
    });
    expect((det.json() as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it("resuelve el ticket (fija closedAt)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/tickets/${ticketId}`,
      headers: auth(),
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json() as { status: string; closedAt: string | null };
    expect(t.status).toBe("resolved");
    expect(t.closedAt).toBeTruthy();
  });

  it("ticket inexistente → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tickets/no-existe",
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("sin token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/tickets" });
    expect(res.statusCode).toBe(401);
  });
});
