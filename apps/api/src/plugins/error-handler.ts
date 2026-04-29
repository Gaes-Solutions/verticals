import { Prisma } from "@gaespos/db";
import type { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

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

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Recurso ya existe",
          target: err.meta?.target,
        });
      }
      if (err.code === "P2025") {
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
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Algo salió mal",
    });
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
