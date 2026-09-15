import type { FastifyPluginAsync } from "fastify";
import { VERTICALES } from "../../lib/verticales.js";

/** Qué giros atiende esta instalación: el registro y el superadmin solo ofrecen esos. */
const plataformaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/public/verticales", async () => ({
    verticales: VERTICALES.filter((v) => app.verticalesActivas.has(v)),
  }));
};

export default plataformaRoutes;
