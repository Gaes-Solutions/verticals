import { getTenantClient } from "@gaespos/db";
import type { EnviarMensajeInput, MensajeResult, MessagingProvider } from "@gaespos/mensajeria";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-recordatorios-citas";

let app: FastifyInstance;
let token: string;
let medicoUsuarioId: string;
let sucursalId: string;
// Mensajes capturados por el provider espía (whatsapp).
const enviados: EnviarMensajeInput[] = [];

function auth() {
  return { authorization: `Bearer ${token}` };
}

class RecorderProvider implements MessagingProvider {
  constructor(readonly canal: "whatsapp" | "sms") {}
  readonly proveedor = "recorder";
  async enviar(input: EnviarMensajeInput): Promise<MensajeResult> {
    if (this.canal === "whatsapp") enviados.push(input);
    return { proveedorMsgId: "rec-1", proveedor: "recorder", status: "enviado", creditos: 0 };
  }
}

async function crearCitaConTutor(
  telefono: string | null,
  horasEnElFuturo: number,
): Promise<string> {
  const c = getTenantClient(SLUG);
  let tutorClienteId: string | undefined;
  if (telefono) {
    const tutor = await c.cliente.create({
      data: { nombre: "Tutor Test", telefonoPrincipal: telefono },
      select: { id: true },
    });
    tutorClienteId = tutor.id;
  }
  const mascota = await c.mascota.create({
    data: {
      nombre: telefono ? "Bobby" : "SinTutor",
      especie: "perro",
      numeroExpediente: `MAS-${Math.floor(Math.random() * 1e6)}`,
      ...(tutorClienteId ? { tutorClienteId } : {}),
    },
    select: { id: true },
  });
  const counter = await c.citaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  const cita = await c.cita.create({
    data: {
      folio: `CT-TEST-${counter.ultimoNumero}`,
      mascotaId: mascota.id,
      medicoUsuarioId,
      sucursalId,
      fechaProgramada: new Date(Date.now() + horasEnElFuturo * 3_600_000),
      motivoTexto: "Vacunación",
      estado: "programada",
    },
    select: { id: true },
  });
  return cita.id;
}

beforeAll(async () => {
  app = await buildTestApp(
    {},
    {
      mensajeriaProviderFactory: (canal) => new RecorderProvider(canal),
    },
  );
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  const sesion = await loginTenantUser(app, SLUG, dueno.email, dueno.password);
  token = sesion.accessToken;
  medicoUsuarioId = sesion.userId;
  sucursalId = (
    await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() })
  ).json()[0].id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("recordatorios de citas", () => {
  it("config arranca con defaults recomendados (ON, 24h, whatsapp)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recordatorios/config",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const cfg = res.json();
    expect(cfg.citasActivo).toBe(true);
    expect(cfg.citasHorasAntes).toBe(24);
    expect(cfg.citasCanal).toBe("whatsapp");
    expect(typeof cfg.citasPlantilla).toBe("string");
  });

  it("manda recordatorio de citas próximas con tutor y omite las que no tienen contacto", async () => {
    const citaId = await crearCitaConTutor("5512345678", 12); // dentro de 24h
    await crearCitaConTutor(null, 12); // sin tutor → omitida
    await crearCitaConTutor("5599998888", 48); // fuera de la ventana → no evaluada

    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.evaluadas).toBe(2);
    expect(r.enviadas).toBe(1);
    expect(r.omitidasSinContacto).toBe(1);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.destino).toBe("5512345678");
    expect(enviados[0]?.contenido).toContain("Bobby");
    expect(enviados[0]?.contenido).toContain(`/citas-publico/${SLUG}/`);

    const c = getTenantClient(SLUG);
    const cita = await c.cita.findUnique({ where: { id: citaId } });
    expect(cita?.recordatorioEnviadoAt).not.toBeNull();
    expect(cita?.recordatorioCanal).toBe("whatsapp");
    expect(cita?.confirmacionToken).toBeTruthy();
  });

  it("no reenvía a una cita ya avisada", async () => {
    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar",
      headers: auth(),
    });
    // La cita con tutor ya tiene recordatorioEnviadoAt y no se reevalúa; la que
    // no tiene contacto sí se reevalúa pero nunca se envía.
    expect(res.json().enviadas).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it("el tutor confirma su cita por el link público", async () => {
    const citaId = await crearCitaConTutor("5500001111", 10);
    await app.inject({ method: "POST", url: "/t/recordatorios/enviar", headers: auth() });
    const c = getTenantClient(SLUG);
    const cita = await c.cita.findUnique({ where: { id: citaId } });
    const tk = cita?.confirmacionToken ?? "";

    const page = await app.inject({ method: "GET", url: `/citas-publico/${SLUG}/${tk}` });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("Confirmar asistencia");

    const conf = await app.inject({
      method: "POST",
      url: `/citas-publico/${SLUG}/${tk}/confirmar`,
    });
    expect(conf.statusCode).toBe(200);
    const recargada = await c.cita.findUnique({ where: { id: citaId } });
    expect(recargada?.estado).toBe("confirmada");
  });

  it("token inválido → 404 en la página pública", async () => {
    const res = await app.inject({ method: "GET", url: `/citas-publico/${SLUG}/no-existe` });
    expect(res.statusCode).toBe(404);
  });

  it("si el dueño apaga los recordatorios, el barrido no manda nada", async () => {
    await app.inject({
      method: "PATCH",
      url: "/t/recordatorios/config",
      headers: auth(),
      payload: { citasActivo: false },
    });
    await crearCitaConTutor("5512340000", 6);
    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar",
      headers: auth(),
    });
    expect(res.json().evaluadas).toBe(0);
    expect(enviados).toHaveLength(0);
    // re-encender para no afectar otras corridas
    await app.inject({
      method: "PATCH",
      url: "/t/recordatorios/config",
      headers: auth(),
      payload: { citasActivo: true },
    });
  });
});
