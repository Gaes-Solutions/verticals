import { PERMISSIONS } from "@gaespos/permissions";
import type { SyncOperation } from "@gaespos/sync";
import type { FastifyPluginAsync } from "fastify";
import { syncPullQuerySchema, syncPushSchema } from "./schemas.js";
import { procesarPush, pull } from "./service.js";

const syncRoutes: FastifyPluginAsync = async (app) => {
  // Empuja el batch de operaciones encoladas offline. Idempotente por
  // idempotency_key: reenviar el mismo batch no duplica nada.
  app.post("/push", async (req) => {
    req.requirePerm(PERMISSIONS.SYNC_USAR);
    const body = syncPushSchema.parse(req.body);
    // Defensa en profundidad: si el batch trae alguna venta, exigimos ventas.crear
    // a nivel de ruta (fail-fast 403), igual que la ruta directa POST /ventas.
    // El gate por operación en procesarPush es la barrera definitiva y conserva
    // la semántica de éxito parcial del sync para ops individuales.
    if (body.operations.some((op) => op.entityType === "venta")) {
      req.requirePerm(PERMISSIONS.VENTAS_CREAR);
    }
    return procesarPush(
      req.tenantPrisma,
      req.principal,
      req.principal.userId,
      body.operations as SyncOperation[],
      body.deviceId,
    );
  });

  // Entrega diffs (upserts + tombstones) desde `since` para refrescar el
  // SQLite local del dispositivo. Sin `since` ⇒ snapshot completo (primer login).
  app.get("/pull", async (req) => {
    req.requirePerm(PERMISSIONS.SYNC_USAR);
    const q = syncPullQuerySchema.parse(req.query);
    return pull(req.tenantPrisma, q.since ?? null);
  });

  // Ping barato para el NetworkMonitor del cliente: confirma red + sesión viva
  // sin tocar datos. El cliente cuenta 3 fallos consecutivos para ir offline.
  app.get("/heartbeat", async (req) => {
    req.requirePerm(PERMISSIONS.SYNC_USAR);
    return { ok: true, serverTime: new Date().toISOString() };
  });
};

export default syncRoutes;
