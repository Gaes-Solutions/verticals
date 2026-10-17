import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import emailPlugin from "../src/plugins/email.js";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["test-brevo", "test-resend", "brevo"],
  ["", "test-resend", "resend"],
  ["", "", "mock"],
])(
  "elige Brevo antes que Resend y conserva configuración anterior",
  async (brevo, resend, expected) => {
    vi.stubEnv("BREVO_API_KEY", brevo);
    vi.stubEnv("RESEND_API_KEY", resend);
    vi.stubEnv("EMAIL_REMITENTE", "tienda@example.invalid");
    const app = Fastify();
    try {
      await app.register(emailPlugin);
      await app.ready();
      expect(app.emailProviderFactory().codigo).toBe(expected);
    } finally {
      await app.close();
    }
  },
);

it("una clave Brevo stub no se degrada silenciosamente a envío simulado", async () => {
  vi.stubEnv("BREVO_API_KEY", "stub-key");
  const app = Fastify();
  try {
    await app.register(emailPlugin);
    await app.ready();
    expect(() => app.emailProviderFactory()).toThrow();
  } finally {
    await app.close();
  }
});
