import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async (_req, reply) => {
    try {
      await app.masterPrisma.$queryRaw`SELECT 1`;
      return {
        status: "ready",
        checks: { masterDb: "ok" },
      };
    } catch (err) {
      app.log.error({ err }, "readiness check failed");
      return reply.code(503).send({
        status: "not_ready",
        checks: { masterDb: "error" },
      });
    }
  });
};

export default healthRoutes;
