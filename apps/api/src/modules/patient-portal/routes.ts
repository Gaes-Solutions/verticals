import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  actualizarPerfilSchema,
  actualizarPermisosSchema,
  agregarDependienteSchema,
  emergencyQrSchema,
  expedienteQuerySchema,
  idParamSchema,
  otorgarConsentSchema,
  patientIdParamSchema,
  publicarRegistroSchema,
  qrTokenParamSchema,
  registrarConsentTenantSchema,
  requestOtpSchema,
  subjectQuerySchema,
  verifyOtpSchema,
} from "./schemas.js";
import {
  PhrError,
  actualizarPerfilSelf,
  actualizarPermisosFamilia,
  agregarDependiente,
  eliminarDependiente,
  exportarDatosArco,
  generarEmergencyQr,
  getDatosCriticos,
  getEmergencyQrPublico,
  getExpedienteUnificado,
  getPacienteSelf,
  leerExpedienteTenant,
  listarAudit,
  listarConsents,
  listarFamilia,
  otorgarConsent,
  publicarRegistro,
  registrarConsentimientoTenant,
  requestOtp,
  revocarConsent,
  verifyOtp,
} from "./service.js";

function errLabel(s: number): string {
  if (s >= 500) return "Internal";
  if (s === 404) return "Not Found";
  if (s === 409) return "Conflict";
  if (s === 403) return "Forbidden";
  if (s === 429) return "Too Many Requests";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof PhrError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

function patientId(req: FastifyRequest): string {
  if (req.user.kind !== "patient") throw new PhrError(401, "Sesión de paciente requerida");
  return req.user.sub;
}

async function resolverTenantId(app: FastifyInstance, slug: string): Promise<string> {
  const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new PhrError(404, "Tenant no encontrado");
  return tenant.id;
}

const isProd = () => process.env.NODE_ENV === "production";

/**
 * Login del paciente sin contraseña (OTP por WhatsApp/SMS). Identidad = phoneE164.
 */
export const patientAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/request-otp",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = requestOtpSchema.parse(req.body);
      const result = await requestOtp(app.masterPrisma, body);
      try {
        const provider = app.mensajeriaProviderFactory(result.method as "whatsapp" | "sms");
        await provider.enviar({
          destino: body.phoneE164,
          contenido: `Tu código GaesSoft Salud es ${result.code}. Vence en 5 minutos.`,
        });
      } catch {
        // el envío real puede no estar configurado en dev; el reto ya quedó creado
      }
      return reply.code(200).send({
        challengeId: result.challengeId,
        method: result.method,
        ...(isProd() ? {} : { debugCode: result.code }),
      });
    },
  );

  app.post(
    "/verify-otp",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = verifyOtpSchema.parse(req.body);
      try {
        const { patient, deviceTrusted } = await verifyOtp(app.masterPrisma, {
          ...body,
          ...(req.ip ? { ip: req.ip } : {}),
        });
        const accessToken = await reply.jwtSign({
          sub: patient.id,
          phoneE164: patient.phoneE164 ?? body.phoneE164,
          kind: "patient",
        });
        return reply.code(200).send({
          accessToken,
          deviceTrusted,
          patient: { id: patient.id, nombre: patient.nombre, phoneE164: patient.phoneE164 },
        });
      } catch (err) {
        if (handleErr(reply, err)) return;
        throw err;
      }
    },
  );
};

/**
 * Portal del paciente. Autenticado como paciente (OTP JWT). Autorización por
 * ownership + scope familiar; toda lectura del expediente registra audit.
 */
export const patientPortalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticatePatient);

  app.get("/me", async (req) => getPacienteSelf(app.masterPrisma, patientId(req)));

  app.patch("/me", async (req) => {
    const body = actualizarPerfilSchema.parse(req.body);
    return actualizarPerfilSelf(app.masterPrisma, patientId(req), body);
  });

  app.get("/expediente", async (req, reply) => {
    const q = expedienteQuerySchema.parse(req.query);
    const me = patientId(req);
    try {
      return await getExpedienteUnificado(
        app.masterPrisma,
        me,
        q.subjectId ?? me,
        { resourceType: q.resourceType, tenantId: q.tenantId },
        { ip: req.ip, userAgent: req.headers["user-agent"] },
      );
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/criticos", async (req, reply) => {
    const q = subjectQuerySchema.parse(req.query);
    const me = patientId(req);
    try {
      return await getDatosCriticos(app.masterPrisma, me, q.subjectId ?? me);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/consents", async (req) => listarConsents(app.masterPrisma, patientId(req)));

  app.post("/consents", async (req, reply) => {
    const body = otorgarConsentSchema.parse(req.body);
    try {
      const consent = await otorgarConsent(app.masterPrisma, {
        patientId: patientId(req),
        ...body,
        ...(req.ip ? { ip: req.ip } : {}),
      });
      return reply.code(201).send(consent);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.delete("/consents/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    try {
      await revocarConsent(app.masterPrisma, patientId(req), id);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/familia", async (req) => listarFamilia(app.masterPrisma, patientId(req)));

  app.post("/familia", async (req, reply) => {
    const body = agregarDependienteSchema.parse(req.body);
    try {
      const lazo = await agregarDependiente(app.masterPrisma, { tutorId: patientId(req), ...body });
      return reply.code(201).send(lazo);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.patch("/familia/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = actualizarPermisosSchema.parse(req.body);
    try {
      return await actualizarPermisosFamilia(app.masterPrisma, patientId(req), id, body);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.delete("/familia/:id", async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    try {
      await eliminarDependiente(app.masterPrisma, patientId(req), id);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/emergency-qr", async (req) => {
    const me = patientId(req);
    const qr = await app.masterPrisma.patientEmergencyQr.findUnique({ where: { patientId: me } });
    return qr ?? { configured: false };
  });

  app.post("/emergency-qr", async (req, reply) => {
    const body = emergencyQrSchema.parse(req.body);
    const qr = await generarEmergencyQr(app.masterPrisma, patientId(req), body.visibleFields);
    return reply.code(201).send(qr);
  });

  app.get("/audit", async (req) => listarAudit(app.masterPrisma, patientId(req)));

  app.get("/export", async (req) => exportarDatosArco(app.masterPrisma, patientId(req)));
};

/**
 * QR de emergencia público (sin login). Solo expone los campos opt-in del paciente.
 */
export const patientEmergencyPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/emergency/:qrToken", async (req, reply) => {
    const { qrToken } = qrTokenParamSchema.parse(req.params);
    try {
      return await getEmergencyQrPublico(app.masterPrisma, qrToken);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

/**
 * Puente clínica → PHR (bajo /t, sesión de tenant). La clínica registra el
 * consentimiento obtenido, publica eventos clínicos y lee el expediente
 * consentido. Todo gated por consent + audit.
 */
const phrTenantRoutes: FastifyPluginAsync = async (app) => {
  app.post("/consentimientos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PHR_SOLICITAR_CONSENT);
    const body = registrarConsentTenantSchema.parse(req.body);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      const consent = await registrarConsentimientoTenant(app.masterPrisma, {
        ...body,
        tenantId,
        userId: req.principal.userId,
        ...(req.ip ? { ip: req.ip } : {}),
      });
      return reply.code(201).send(consent);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/registros", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PHR_PUBLICAR_REGISTRO);
    const body = publicarRegistroSchema.parse(req.body);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      const record = await publicarRegistro(app.masterPrisma, {
        ...body,
        tenantId,
        createdByUserId: req.principal.userId,
      });
      return reply.code(201).send(record);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/pacientes/:patientId/expediente", async (req, reply) => {
    req.requirePerm(PERMISSIONS.PHR_LEER_CONSENTIDO);
    const { patientId: pid } = patientIdParamSchema.parse(req.params);
    try {
      const tenantId = await resolverTenantId(app, req.tenantSlug);
      return await leerExpedienteTenant(app.masterPrisma, {
        patientId: pid,
        tenantId,
        userId: req.principal.userId,
        ...(req.ip ? { ip: req.ip } : {}),
        ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] as string } : {}),
      });
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default phrTenantRoutes;
