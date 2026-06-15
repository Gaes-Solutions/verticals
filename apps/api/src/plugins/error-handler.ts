import { PermissionDeniedError } from "@gaespos/permissions";
import type { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { captureError } from "../observability/sentry.js";

function isPrismaKnownRequestError(
  err: unknown,
): err is { code: string; meta?: { target?: unknown } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("P") &&
    err.constructor?.name === "PrismaClientKnownRequestError"
  );
}

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validación falló",
        issues: err.issues,
      });
    }

    if (err instanceof PermissionDeniedError) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: err.message,
        missing: err.missing,
      });
    }

    if (isPrismaKnownRequestError(err)) {
      const prismaErr = err as { code: string; meta?: { target?: unknown } };
      if (prismaErr.code === "P2002") {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Recurso ya existe",
          target: prismaErr.meta?.target,
        });
      }
      if (prismaErr.code === "P2025") {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Recurso no encontrado",
        });
      }
    }

    const statusCode = err.statusCode;
    if (statusCode !== undefined && statusCode < 500) {
      return reply.code(statusCode).send({
        statusCode,
        error: err.name,
        message: err.message,
      });
    }

    req.log.error({ err }, "Unhandled error");
    captureError(err, { method: req.method, url: req.url });
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Algo salió mal",
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
