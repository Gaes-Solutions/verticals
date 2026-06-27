import { hash as argon2Hash } from "@node-rs/argon2";
import { createTenantClient } from "./tenant-client.js";

/**
 * Siembra datos demo en un tenant veterinario para probar web-clinical:
 * un médico, una recepción, 3 mascotas con tutor y una cita de hoy.
 * Idempotente por email/nombre. Uso:
 *   tsx src/seed-vet-demo.ts <slug>
 */
async function main(): Promise<void> {
  const slug = process.argv[2] ?? "clinica-vet-patitas";
  const password = process.argv[3] ?? "Clinica!2026";
  const client = createTenantClient(slug);

  try {
    const roles = await client.rol.findMany({ select: { id: true, codigo: true } });
    const rolDe = (...codigos: string[]) =>
      roles.find((r) => codigos.includes(r.codigo)) ?? roles.find((r) => r.codigo === "dueno");
    const medicoRol = rolDe("medico", "veterinario");
    const recepRol = rolDe("recepcion", "recepcionista");
    if (!medicoRol || !recepRol) {
      throw new Error(
        `Roles no encontrados. Disponibles: ${roles.map((r) => r.codigo).join(", ")}`,
      );
    }

    const sucursal = await client.sucursal.findFirst({ select: { id: true } });
    if (!sucursal) throw new Error("El tenant no tiene sucursal.");

    const passwordHash = await argon2Hash(password);
    async function upsertUsuario(email: string, nombre: string, rolId: string): Promise<string> {
      const u = await client.usuario.upsert({
        where: { email },
        update: { passwordHash, isActive: true },
        create: { email, passwordHash, nombre, tipoUsuario: "empleado" },
      });
      await client.usuarioRol.upsert({
        where: { usuarioId_rolId: { usuarioId: u.id, rolId } },
        update: {},
        create: { usuarioId: u.id, rolId },
      });
      return u.id;
    }

    const medicoEmail = "medico@vetdemo.gaessoft.local";
    const recepEmail = "recepcion@vetdemo.gaessoft.local";
    const medicoId = await upsertUsuario(medicoEmail, "Dra. Vet Demo", medicoRol.id);
    await upsertUsuario(recepEmail, "Recepción Demo", recepRol.id);

    const tutor = await client.cliente.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    const especies = [
      { nombre: "Max", especie: "perro", raza: "Labrador" },
      { nombre: "Luna", especie: "gato", raza: "Siames" },
      { nombre: "Rocky", especie: "perro", raza: "Bulldog" },
    ] as const;
    const mascotaIds: string[] = [];
    for (const m of especies) {
      const existe = await client.mascota.findFirst({
        where: { nombre: m.nombre },
        select: { id: true },
      });
      if (existe) {
        mascotaIds.push(existe.id);
        continue;
      }
      const n = await client.mascota.count();
      const creada = await client.mascota.create({
        data: {
          numeroExpediente: `MAS-${String(n + 1).padStart(6, "0")}`,
          nombre: m.nombre,
          especie: m.especie,
          raza: m.raza,
          sexo: "macho",
          ...(tutor ? { tutor: { connect: { id: tutor.id } } } : {}),
        },
        select: { id: true },
      });
      mascotaIds.push(creada.id);
    }

    const hoy = new Date();
    hoy.setHours(10, 0, 0, 0);
    const yaHayCita = await client.cita.findFirst({
      where: {
        medicoUsuarioId: medicoId,
        fechaProgramada: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { id: true },
    });
    if (!yaHayCita && mascotaIds[0]) {
      await client.cita.create({
        data: {
          folio: `CT-DEMO-${Date.now()}`,
          mascotaId: mascotaIds[0],
          medicoUsuarioId: medicoId,
          sucursalId: sucursal.id,
          fechaProgramada: hoy,
          motivoTexto: "Consulta general (demo)",
          estado: "programada",
        },
      });
    }

    console.info(
      [
        `Seed vet demo en "${slug}":`,
        `  médico:    ${medicoEmail} / ${password}`,
        `  recepción: ${recepEmail} / ${password}`,
        `  mascotas:  ${mascotaIds.length} · cita de hoy creada`,
        "  (La vertical salud fuerza 2FA: en el primer login la app guía el alta del autenticador.)",
      ].join("\n"),
    );
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
