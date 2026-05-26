import { type AiProvider, AnthropicClient, MockAiProvider } from "@gaespos/ai";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export type AiProviderFactory = () => AiProvider;

declare module "fastify" {
  interface FastifyInstance {
    aiProviderFactory: AiProviderFactory;
  }
}

const defaultFactory: AiProviderFactory = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("stub-")) {
    return new MockAiProvider();
  }
  return new AnthropicClient({ apiKey });
};

const aiPlugin: FastifyPluginAsync<{ factory?: AiProviderFactory }> = async (app, opts) => {
  app.decorate("aiProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(aiPlugin, { name: "ai" });
