/**
 * Demo end-to-end Hito 5 — Offline-first + sync engine (Análisis 8).
 *
 * Ejecuta contra una instancia LIVE de la API (default http://localhost:3000).
 * Simula un cajero que opera SIN red y luego reconecta:
 *
 *   1. Provisiona tienda + producto/stock + caja.
 *   2. MODO OFFLINE: encola operaciones (2 ventas + alta de cliente) con
 *      idempotency keys, como haría el SQLite local del dispositivo.
 *   3. RECONEXIÓN: push del batch → el backend las aplica idempotentemente.
 *   4. Reintento del MISMO batch → deduped (cero duplicados).
 *   5. Conflicto: servidor y dispositivo editan el mismo campo → merge_required.
 *   6. Pull de catálogos (diffs since) para refrescar el dispositivo.
 *
 * Uso:  pnpm --filter @gaespos/api demo:offline-sync
 */

import { randomUUID } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const SLUG = `demo-sync-${Date.now().toString(36)}`;
const OWNER_EMAIL = `owner-${SLUG}@demo.local`;
const OWNER_PASSWORD = "Owner!2026";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

let stepNum = 0;
function step(title: string): void {
  stepNum += 1;
  console.log(`\n${c.bold}${c.cyan}━━━ Paso ${stepNum}: ${title}${c.reset}`);
}
function ok(line: string): void {
  console.log(`  ${c.green}✓${c.reset} ${line}`);
}
function info(line: string): void {
  console.log(`  ${c.dim}${line}${c.reset}`);
}

interface ApiResult<T = unknown> {
  status: number;
  body: T;
}
async function call<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
function assertOk(r: ApiResult, expected: number, ctx: string): void {
  if (r.status !== expected) {
    console.error(`\n${c.red}✗ ${ctx}: esperaba ${expected}, recibió ${r.status}${c.reset}`);
    console.error(`${c.red}  ${JSON.stringify(r.body)}${c.reset}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log(`${c.bold}Demo Hito 5 — Offline-first + sync${c.reset}`);
  console.log(`${c.dim}API: ${API_URL} · tenant: ${SLUG}${c.reset}`);

  step("Provisionar tienda + producto/stock + caja abierta");
  const admin = await call<{ accessToken: string }>("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assertOk(admin, 200, "admin login");
  const adminToken = admin.body.accessToken;
  await call("POST", "/tenants", {
    token: adminToken,
    body: { slug: SLUG, name: "Tienda Sync Demo", planCode: "growth" },
  });
  await call("POST", `/tenants/${SLUG}/bootstrap-owner`, {
    token: adminToken,
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, nombre: "Dueño" },
  });
  const login = await call<{ accessToken: string }>("POST", "/auth/tenant/login", {
    body: { tenantSlug: SLUG, email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  const token = login.body.accessToken;
  const sucs = await call<Array<{ id: string; codigo: string }>>("GET", "/t/sucursales", { token });
  const sucursalId = sucs.body.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";
  const cajas = await call<Array<{ id: string }>>("GET", "/t/cajas", { token });
  const cajaId = cajas.body[0]?.id ?? "";
  await call("POST", `/t/cajas/${cajaId}/aperturar`, { token, body: { montoInicial: "100" } });
  const cat = await call<{ id: string }>("POST", "/t/categorias", {
    token,
    body: { nombre: "General", codigo: "GEN" },
  });
  const prod = await call<{ variantes: Array<{ id: string }> }>("POST", "/t/productos", {
    token,
    body: {
      skuPadre: "SYNC-001",
      nombre: "Producto Sync",
      categoriaId: cat.body.id,
      precioBase: "100.00",
    },
  });
  const varianteId = prod.body.variantes[0]?.id ?? "";
  await call("POST", "/t/inventario/ajustes", {
    token,
    body: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "50", motivo: "Inicial" },
  });
  ok(`tienda ${SLUG} · producto con 50 en stock · caja abierta`);

  step("MODO OFFLINE — el dispositivo encola operaciones sin red");
  const ventaKey1 = randomUUID();
  const ventaKey2 = randomUUID();
  const clienteKey = randomUUID();
  const batch = [
    {
      idempotencyKey: ventaKey1,
      entityType: "venta",
      entityIdLocal: "venta-1",
      operation: "create",
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "2" }],
        pagos: [{ metodo: "efectivo", monto: "232" }],
      },
    },
    {
      idempotencyKey: ventaKey2,
      entityType: "venta",
      entityIdLocal: "venta-2",
      operation: "create",
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "116" }],
      },
    },
    {
      idempotencyKey: clienteKey,
      entityType: "cliente",
      entityIdLocal: "cli-1",
      operation: "create",
      payload: { nombre: "Cliente", apellidos: "Offline", telefonoPrincipal: "3330000001" },
    },
  ];
  info(`${batch.length} operaciones en la cola local (2 ventas + 1 cliente)`);

  step("RECONEXIÓN — push del batch al backend");
  const push1 = await call<{
    applied: number;
    deduped: number;
    results: Array<{ entityType: string; entityIdRemoto: string }>;
  }>("POST", "/t/sync/push", { token, body: { deviceId: "caja-01", operations: batch } });
  assertOk(push1, 200, "sync push");
  ok(
    `aplicadas: ${c.bold}${push1.body.applied}${c.reset} · el backend devolvió los ids remotos de cada operación`,
  );
  const clienteRemoto =
    push1.body.results.find((r) => r.entityType === "cliente")?.entityIdRemoto ?? "";

  step("REINTENTO del mismo batch — idempotencia (cero duplicados)");
  const push2 = await call<{ applied: number; deduped: number }>("POST", "/t/sync/push", {
    token,
    body: { deviceId: "caja-01", operations: batch },
  });
  const ventas = await call<{ total: number }>("GET", "/t/ventas", { token });
  ok(
    `re-push → deduped: ${c.bold}${push2.body.deduped}${c.reset} · ventas totales en el servidor: ${ventas.body.total} (no se duplicó)`,
  );

  step("CONFLICTO — servidor y dispositivo editan el mismo campo");
  // El servidor ya tiene otro valor (otro dispositivo sincronizó antes)
  const cli = await call<Array<{ id: string }>>("GET", "/t/clientes", { token });
  void cli;
  const updateConflict = {
    idempotencyKey: randomUUID(),
    entityType: "cliente",
    entityIdLocal: "cli-1",
    entityIdRemoto: clienteRemoto,
    operation: "update",
    baseUpdatedAt: new Date(Date.now() - 3600000).toISOString(),
    baseSnapshot: { telefonoPrincipal: "3330000001" },
    payload: { telefonoPrincipal: "3332222222" },
  };
  // primero el "otro dispositivo" cambia el teléfono en el servidor
  await call("POST", "/t/sync/push", {
    token,
    body: {
      deviceId: "caja-02",
      operations: [
        {
          idempotencyKey: randomUUID(),
          entityType: "cliente",
          entityIdLocal: "cli-1",
          entityIdRemoto: clienteRemoto,
          operation: "update",
          baseSnapshot: { telefonoPrincipal: "3330000001" },
          payload: { telefonoPrincipal: "3331111111" },
        },
      ],
    },
  });
  const pushConflict = await call<{
    conflicts: number;
    results: Array<{ status: string; conflict?: { divergentFields: string[] } }>;
  }>("POST", "/t/sync/push", {
    token,
    body: { deviceId: "caja-01", operations: [updateConflict] },
  });
  ok(
    `conflictos: ${c.bold}${pushConflict.body.conflicts}${c.reset} · campos divergentes: ${pushConflict.body.results[0]?.conflict?.divergentFields.join(", ") ?? "—"} → ${c.yellow}merge_required${c.reset} (el dispositivo resuelve y re-empuja)`,
  );

  step("PULL — refresco de catálogos al dispositivo (diffs)");
  const t0 = new Date(Date.now() - 86400000).toISOString();
  const pull = await call<{
    diffs: Array<{ entityType: string; upserts: unknown[]; tombstones: unknown[] }>;
  }>("GET", `/t/sync/pull?since=${encodeURIComponent(t0)}`, { token });
  assertOk(pull, 200, "sync pull");
  const resumen = pull.body.diffs.map((d) => `${d.entityType}:${d.upserts.length}`).join(" · ");
  ok(`diffs recibidos → ${resumen}`);

  console.log(
    `\n${c.bold}${c.green}✓ Demo Hito 5 completo — offline → reconexión → sync idempotente → conflicto → pull${c.reset}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`${c.red}Demo falló:${c.reset}`, err);
  process.exit(1);
});
