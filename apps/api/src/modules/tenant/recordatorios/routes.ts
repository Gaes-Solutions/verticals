import { getTenantClient } from "@gaespos/db";
import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { loadConfig } from "../../../config.js";
import {
  citaPublicaCancelarSchema,
  citaPublicaParamsSchema,
  configRecordatoriosUpdateSchema,
} from "./schemas.js";
import {
  RecordatorioError,
  cancelarCitaPublica,
  citaPublicaPorToken,
  confirmarCitaPublica,
  enviarRecordatoriosCitas,
  enviarRecordatoriosVacunas,
  getConfigRecordatorios,
  updateConfigRecordatorios,
} from "./service.js";

function handleErr(reply: FastifyReply, err: unknown): unknown | null {
  if (err instanceof RecordatorioError) {
    return reply
      .code(err.statusCode)
      .send({ statusCode: err.statusCode, error: "Error", message: err.message });
  }
  return null;
}

// ── Rutas autenticadas del tenant (config + disparo manual) ──────────────────
const recordatoriosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_LEER);
    return getConfigRecordatorios(req.tenantPrisma);
  });

  app.patch("/config", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const body = configRecordatoriosUpdateSchema.parse(req.body);
    return updateConfigRecordatorios(req.tenantPrisma, body);
  });

  // Disparo manual del barrido para este tenant (útil para probar). El scheduler
  // hace lo mismo por cron en todos los tenants.
  app.post("/enviar", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const config = loadConfig();
    const factory = app.mensajeriaProviderFactory;
    return enviarRecordatoriosCitas(
      req.tenantPrisma,
      {
        whatsapp: factory("whatsapp"),
        sms: factory("sms"),
        email: app.emailProviderFactory(),
      },
      {
        tenantSlug: req.tenantSlug,
        clinicaNombre: "",
        baseUrl: config.PUBLIC_BASE_URL,
      },
    );
  });

  app.post("/enviar-vacunas", async (req) => {
    req.requirePerm(PERMISSIONS.AGENDA_GESTIONAR);
    const factory = app.mensajeriaProviderFactory;
    return enviarRecordatoriosVacunas(
      req.tenantPrisma,
      {
        whatsapp: factory("whatsapp"),
        sms: factory("sms"),
        email: app.emailProviderFactory(),
      },
      { clinicaNombre: "" },
    );
  });
};

// ── Página/endpoints públicos de confirmación (link que abre el tutor) ───────
function paginaConfirmacion(
  vista: {
    estado: string;
    sujeto: string;
    fechaProgramada: string;
    clinica: string;
    puedeConfirmar: boolean;
    puedeCancelar: boolean;
  },
  accionBase: string,
): string {
  const fecha = new Date(vista.fechaProgramada).toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const estados: Record<string, { txt: string; color: string }> = {
    programada: { txt: "Programada", color: "#0ea5e9" },
    confirmada: { txt: "¡Confirmada! Te esperamos.", color: "#16a34a" },
    cancelada: { txt: "Cita cancelada", color: "#dc2626" },
    checkin: { txt: "En sala", color: "#d97706" },
    en_consulta: { txt: "En consulta", color: "#16a34a" },
    completada: { txt: "Completada", color: "#16a34a" },
    no_asistio: { txt: "No asististe", color: "#dc2626" },
  };
  const e = estados[vista.estado] ?? { txt: vista.estado, color: "#475569" };
  const botones =
    vista.puedeConfirmar || vista.puedeCancelar
      ? `<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">
           ${vista.puedeConfirmar ? `<button type="button" onclick="act('confirmar')" style="background:#0d9488;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer">Confirmar asistencia</button>` : ""}
           ${vista.puedeCancelar ? `<button type="button" onclick="act('cancelar')" style="background:#fff;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer">No podré asistir</button>` : ""}
         </div>
         <script>
           async function act(a){
             const r = await fetch(${JSON.stringify(accionBase)} + '/' + a, {
               method:'POST', headers:{'Content-Type':'application/json'},
               body: JSON.stringify(a === 'cancelar' ? { motivo: 'Cancelada desde el recordatorio' } : {}),
             });
             const html = await r.text();
             document.open(); document.write(html); document.close();
           }
         </script>`
      : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tu cita en ${vista.clinica}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
  <div style="background:#fff;border-radius:18px;box-shadow:0 10px 40px rgba(2,6,23,.08);max-width:440px;width:100%;padding:32px;text-align:center">
    <p style="color:#0d9488;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:13px;margin:0 0 6px">${vista.clinica}</p>
    <h1 style="font-size:22px;color:#0f172a;margin:0 0 4px">Cita de ${vista.sujeto}</h1>
    <p style="color:#475569;font-size:16px;margin:0 0 16px;text-transform:capitalize">${fecha}</p>
    <p style="display:inline-block;background:${e.color}1a;color:${e.color};font-weight:600;border-radius:999px;padding:6px 14px;font-size:14px;margin:0">${e.txt}</p>
    ${botones}
  </div>
</body></html>`;
}

async function resolverClient(app: Parameters<FastifyPluginAsync>[0], slug: string) {
  const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status === "cancelled") return null;
  return getTenantClient(slug);
}

export const citasPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/citas-publico/:tenantSlug/:token", async (req, reply) => {
    const p = citaPublicaParamsSchema.parse(req.params);
    const accionBase = `/citas-publico/${p.tenantSlug}/${p.token}`;
    const client = await resolverClient(app, p.tenantSlug);
    if (!client) return reply.code(404).type("text/html").send("<h1>Negocio no encontrado</h1>");
    try {
      const vista = await citaPublicaPorToken(client, p.token);
      return reply.type("text/html").send(paginaConfirmacion(vista, accionBase));
    } catch {
      return reply.code(404).type("text/html").send("<h1>Cita no encontrada</h1>");
    }
  });

  app.post(
    "/citas-publico/:tenantSlug/:token/confirmar",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = citaPublicaParamsSchema.parse(req.params);
      const accionBase = `/citas-publico/${p.tenantSlug}/${p.token}`;
      const client = await resolverClient(app, p.tenantSlug);
      if (!client) return reply.code(404).type("text/html").send("<h1>Negocio no encontrado</h1>");
      try {
        const vista = await confirmarCitaPublica(client, p.token);
        return reply.type("text/html").send(paginaConfirmacion(vista, accionBase));
      } catch (err) {
        const vista = await citaPublicaPorToken(client, p.token).catch(() => null);
        if (vista) return reply.type("text/html").send(paginaConfirmacion(vista, accionBase));
        if (handleErr(reply, err) !== null) return reply;
        throw err;
      }
    },
  );

  app.post(
    "/citas-publico/:tenantSlug/:token/cancelar",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = citaPublicaParamsSchema.parse(req.params);
      const accionBase = `/citas-publico/${p.tenantSlug}/${p.token}`;
      const body = citaPublicaCancelarSchema.parse(req.body ?? {});
      const client = await resolverClient(app, p.tenantSlug);
      if (!client) return reply.code(404).type("text/html").send("<h1>Negocio no encontrado</h1>");
      try {
        const vista = await cancelarCitaPublica(client, p.token, body.motivo);
        return reply.type("text/html").send(paginaConfirmacion(vista, accionBase));
      } catch (err) {
        const vista = await citaPublicaPorToken(client, p.token).catch(() => null);
        if (vista) return reply.type("text/html").send(paginaConfirmacion(vista, accionBase));
        if (handleErr(reply, err) !== null) return reply;
        throw err;
      }
    },
  );
};

export default recordatoriosRoutes;
