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

const SLUG = "test-recordatorios-vacunas";

let app: FastifyInstance;
let token: string;
let medicoId: string;
let vacunaCatalogoId: string;
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

// Crea mascota (con o sin tutor con teléfono) + una vacunación con próxima dosis.
async function crearVacunacion(opts: {
  telefono: string | null;
  proximaEnDias: number;
  fechaAplicacion?: Date;
  mascotaId?: string;
  tutorClienteId?: string;
}): Promise<{ vacunacionId: string; mascotaId: string; tutorClienteId?: string }> {
  const c = getTenantClient(SLUG);
  let mascotaId = opts.mascotaId;
  let tutorClienteId = opts.tutorClienteId;
  if (!mascotaId) {
    if (opts.telefono) {
      const tutor = await c.cliente.create({
        data: { nombre: "Tutor Vac", telefonoPrincipal: opts.telefono },
        select: { id: true },
      });
      tutorClienteId = tutor.id;
    }
    const mascota = await c.mascota.create({
      data: {
        nombre: opts.telefono ? "Firulais" : "SinTutor",
        especie: "perro",
        numeroExpediente: `MAS-${Math.floor(Math.random() * 1e6)}`,
        ...(tutorClienteId ? { tutorClienteId } : {}),
      },
      select: { id: true },
    });
    mascotaId = mascota.id;
  }
  const v = await c.vacunacion.create({
    data: {
      mascotaId,
      vacunaCatalogoId,
      medicoAplicadorId: medicoId,
      fechaAplicacion: opts.fechaAplicacion ?? new Date(Date.now() - 350 * 86_400_000),
      numeroLote: "L-001",
      caducidadLote: new Date(Date.now() + 200 * 86_400_000),
      proximaAplicacionFecha: new Date(Date.now() + opts.proximaEnDias * 86_400_000),
    },
    select: { id: true },
  });
  return { vacunacionId: v.id, mascotaId, ...(tutorClienteId ? { tutorClienteId } : {}) };
}

beforeAll(async () => {
  app = await buildTestApp(
    {},
    { mensajeriaProviderFactory: (canal) => new RecorderProvider(canal) },
  );
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  const sesion = await loginTenantUser(app, SLUG, dueno.email, dueno.password);
  token = sesion.accessToken;
  medicoId = sesion.userId;
  const c = getTenantClient(SLUG);
  const vac = await c.vacunaCatalogo.create({
    data: { nombreComercial: "Rabia Anual", aplicaVet: true },
    select: { id: true },
  });
  vacunaCatalogoId = vac.id;
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("recordatorios de próxima vacuna", () => {
  it("config incluye defaults de vacunas (ON, 7 días, whatsapp)", async () => {
    const cfg = (
      await app.inject({ method: "GET", url: "/t/recordatorios/config", headers: auth() })
    ).json();
    expect(cfg.vacunasActivo).toBe(true);
    expect(cfg.vacunasDiasAntes).toBe(7);
    expect(cfg.vacunasCanal).toBe("whatsapp");
    expect(typeof cfg.vacunasPlantilla).toBe("string");
  });

  it("avisa de la próxima dosis dentro de la ventana y omite sin contacto", async () => {
    const { vacunacionId } = await crearVacunacion({ telefono: "5512345678", proximaEnDias: 3 });
    await crearVacunacion({ telefono: null, proximaEnDias: 3 }); // sin tutor
    await crearVacunacion({ telefono: "5599998888", proximaEnDias: 30 }); // fuera de ventana

    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar-vacunas",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.evaluadas).toBe(2);
    expect(r.enviadas).toBe(1);
    expect(r.omitidasSinContacto).toBe(1);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.destino).toBe("5512345678");
    expect(enviados[0]?.contenido).toContain("Firulais");
    expect(enviados[0]?.contenido).toContain("Rabia Anual");

    const c = getTenantClient(SLUG);
    const v = await c.vacunacion.findUnique({ where: { id: vacunacionId } });
    expect(v?.recordatorioProximaEnviadoAt).not.toBeNull();
  });

  it("no reenvía a una dosis ya avisada", async () => {
    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar-vacunas",
      headers: auth(),
    });
    expect(res.json().enviadas).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it("no avisa de una dosis ya cumplida por una aplicación posterior (supersesión)", async () => {
    // Vacunación vieja con próxima dosis vencida, pero ya re-aplicada después.
    const vieja = await crearVacunacion({
      telefono: "5500001111",
      proximaEnDias: -5,
      fechaAplicacion: new Date(Date.now() - 400 * 86_400_000),
    });
    // Nueva aplicación de la MISMA vacuna al MISMO sujeto (más reciente), próxima lejos.
    await crearVacunacion({
      telefono: null,
      proximaEnDias: 60,
      fechaAplicacion: new Date(Date.now() - 20 * 86_400_000),
      mascotaId: vieja.mascotaId,
      ...(vieja.tutorClienteId ? { tutorClienteId: vieja.tutorClienteId } : {}),
    });

    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar-vacunas",
      headers: auth(),
    });
    // La vieja se marca como superada (sin enviar); no cuenta como enviada.
    expect(res.json().enviadas).toBe(0);
    expect(enviados).toHaveLength(0);
    const c = getTenantClient(SLUG);
    const v = await c.vacunacion.findUnique({ where: { id: vieja.vacunacionId } });
    expect(v?.recordatorioProximaEnviadoAt).not.toBeNull();
  });

  it("si el dueño apaga los recordatorios de vacunas, no manda nada", async () => {
    await app.inject({
      method: "PATCH",
      url: "/t/recordatorios/config",
      headers: auth(),
      payload: { vacunasActivo: false },
    });
    await crearVacunacion({ telefono: "5512340000", proximaEnDias: 2 });
    enviados.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/t/recordatorios/enviar-vacunas",
      headers: auth(),
    });
    expect(res.json().evaluadas).toBe(0);
    expect(enviados).toHaveLength(0);
    await app.inject({
      method: "PATCH",
      url: "/t/recordatorios/config",
      headers: auth(),
      payload: { vacunasActivo: true },
    });
  });
});
