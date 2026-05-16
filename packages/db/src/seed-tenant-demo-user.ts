import { hash as argon2Hash } from "@node-rs/argon2";
import { createTenantClient } from "./tenant-client.js";

async function main(): Promise<void> {
  const slug = process.argv[2] ?? "demo";
  const email = process.argv[3] ?? "duenio@demo.gaessoft.local";
  const password = process.argv[4] ?? "ChangeMe!2026";
  const rolCodigo = process.argv[5] ?? "dueno";

  const client = createTenantClient(slug);
  try {
    const rol = await client.rol.findUnique({ where: { codigo: rolCodigo } });
    if (!rol) {
      throw new Error(
        `Rol "${rolCodigo}" no encontrado en tenant "${slug}". Ejecuta antes: gaes-migrate tenant seed ${slug}`,
      );
    }

    const passwordHash = await argon2Hash(password);

    const usuario = await client.usuario.upsert({
      where: { email },
      update: {
        passwordHash,
        isActive: true,
      },
      create: {
        email,
        passwordHash,
        nombre: "Demo",
        apellidos: "Owner",
        tipoUsuario: "empleado",
      },
    });

    await client.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rol.id } },
      update: {},
      create: { usuarioId: usuario.id, rolId: rol.id },
    });

    console.info(
      `Usuario ${email} (id=${usuario.id}) sembrado en tenant ${slug} con rol ${rolCodigo}`,
    );
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
