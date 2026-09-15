import { z } from "zod";
import { VERTICALES, type Vertical } from "./lib/verticales.js";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // "::" (IPv6, dual-stack) para que el api sea alcanzable por la red privada de
  // Railway (`*.railway.internal` es IPv6-only). En 0.0.0.0 el proxy /api de las
  // SPAs se cuelga. `::` también acepta IPv4 en Linux dual-stack.
  HOST: z.string().default("::"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL_MASTER: z.string().url(),
  DATABASE_URL_TENANT: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres"),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET debe tener al menos 32 caracteres"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  // Número EXACTO de proxies de confianza frente al API (Railway = 1). Fastify lo
  // pasa a proxy-addr para tomar solo el último salto de X-Forwarded-For como
  // req.ip; nunca la IP más a la izquierda que el cliente puede falsificar. Con
  // `trustProxy: true` (cadena completa) el rate-limit por IP se evade con un XFF
  // aleatorio por request. 0 = ignorar XFF (usar socket, p.ej. sin proxy).
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  FLOWS_SCHEDULER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  FLOWS_RUN_INTERVAL_MIN: z.coerce.number().int().positive().default(360),
  RECORDATORIOS_SCHEDULER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RECORDATORIOS_RUN_INTERVAL_MIN: z.coerce.number().int().positive().default(60),
  // Base pública del API para armar el link de confirmación de citas que se
  // manda al tutor (anti-no-show). En prod = dominio del API.
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Giros que atiende esta instalación, separados por coma (p. ej. "retail_mayoreo").
  // Vacío = todos. Lo que no está activo ni se carga en el API ni se ofrece al
  // dar de alta un negocio: así el piloto de Retail no expone módulos de salud.
  VERTICALES_ACTIVAS: z
    .string()
    .optional()
    .transform((valor, ctx): Vertical[] | undefined => {
      const lista = (valor ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (lista.length === 0) return undefined;
      const desconocidas = lista.filter((v) => !(VERTICALES as readonly string[]).includes(v));
      if (desconocidas.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Verticales desconocidas: ${desconocidas.join(", ")}. Usa: ${VERTICALES.join(", ")}`,
        });
        return z.NEVER;
      }
      return lista as Vertical[];
    }),
  // Billing de la plataforma (cobro de suscripción al tenant). Ambas son opcionales
  // (dev/tests usan el cobro mock), pero si hay STRIPE_API_KEY el webhook queda vivo
  // y el secreto de firma es OBLIGATORIO: sin él la verificación fallaría-abierto.
  STRIPE_API_KEY: z.string().trim().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(16, "STRIPE_WEBHOOK_SECRET debe tener al menos 16 caracteres")
    .optional(),
});

const configSchemaChecked = configSchema.superRefine((cfg, ctx) => {
  if (cfg.STRIPE_API_KEY && !cfg.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: "STRIPE_WEBHOOK_SECRET es obligatorio cuando STRIPE_API_KEY está configurada",
    });
  }
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const parsed = configSchemaChecked.safeParse(process.env);
  if (!parsed.success) {
    console.error("[config] Variables de entorno inválidas:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
