import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface SalaVideo {
  url: string;
  proveedor: string;
}

export interface TelemedicineProvider {
  /** Crea una sala de video para una cita de telemedicina. */
  crearSala(opts: { nombre: string }): Promise<SalaVideo>;
}

/** Mock: genera una URL de sala determinística sin llamar a ningún servicio. */
export function mockTelemedicine(): TelemedicineProvider {
  return {
    async crearSala() {
      const id = randomBytes(9).toString("hex");
      return { url: `https://meet.gaessalud.mx/room/${id}`, proveedor: "mock" };
    },
  };
}

/**
 * Daily.co: crea una sala vía su API REST. Requiere DAILY_API_KEY. Mock-first:
 * si no hay llave se usa el mock (igual que las demás integraciones).
 */
export class DailyClient implements TelemedicineProvider {
  constructor(private readonly apiKey: string) {}

  async crearSala(opts: { nombre: string }): Promise<SalaVideo> {
    const res = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: opts.nombre.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40),
        privacy: "private",
        properties: {
          enable_prejoin_ui: true,
          exp: Math.floor(Date.now() / 1000) + 7 * 86400,
        },
      }),
    });
    if (!res.ok) throw new Error(`Daily.co error ${res.status}`);
    const data = (await res.json()) as { url: string };
    return { url: data.url, proveedor: "daily" };
  }
}

export type TelemedicineProviderFactory = () => TelemedicineProvider;

const defaultFactory: TelemedicineProviderFactory = () => {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey || apiKey.startsWith("stub-")) return mockTelemedicine();
  return new DailyClient(apiKey);
};

declare module "fastify" {
  interface FastifyInstance {
    telemedicineProviderFactory: TelemedicineProviderFactory;
  }
}

const telemedicinePlugin: FastifyPluginAsync<{ factory?: TelemedicineProviderFactory }> = async (
  app,
  opts,
) => {
  app.decorate("telemedicineProviderFactory", opts.factory ?? defaultFactory);
};

export default fp(telemedicinePlugin, { name: "telemedicine" });
