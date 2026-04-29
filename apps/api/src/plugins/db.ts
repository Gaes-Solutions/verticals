import { type MasterPrismaClient, masterPrisma } from "@gaespos/db";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    masterPrisma: MasterPrismaClient;
  }
}

const dbPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("masterPrisma", masterPrisma);

  app.addHook("onClose", async () => {
    await masterPrisma.$disconnect();
  });
};

export default fp(dbPlugin, { name: "db" });
