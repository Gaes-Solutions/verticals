import { hash as argon2Hash } from "@node-rs/argon2";
import { createTenantClient } from "./tenant-client.js";

/**
 * Siembra una empresa B2B demo + un usuario admin para probar el portal
 * mayorista (web-b2b). Idempotente: upsert por RFC (empresa) y email (usuario).
 *
 *   tsx src/seed-b2b-demo.ts <slug> <email> <password> <razonSocial>
 */
async function main(): Promise<void> {
  const slug = process.argv[2] ?? "demo";
  const email = process.argv[3] ?? "compras@demob2b.gaessoft.local";
  const password = process.argv[4] ?? "ChangeMe!2026";
  const razonSocial = process.argv[5] ?? "Distribuidora Demo SA de CV";
  const rfc = "DEM010101AB1";

  const client = createTenantClient(slug);
  try {
    const empresa = await client.clienteB2b.upsert({
      where: { rfc },
      update: { isActive: true, razonSocial },
      create: {
        razonSocial,
        nombreComercial: "Demo Mayorista",
        rfc,
        regimenFiscalSat: "601",
        usoCfdiDefault: "G03",
        codigoPostalFiscal: "44100",
        emailPrincipal: email,
        listaPrecioPrincipalCodigo: "PUBLICO",
        condicionesPago: "credito",
        diasCreditoDefault: 30,
        formatoFacturaPreferido: "pdf_xml",
      },
    });

    const passwordHash = await argon2Hash(password);
    const usuario = await client.clienteB2bUsuario.upsert({
      where: { email },
      update: { passwordHash, isActive: true, clienteB2bId: empresa.id },
      create: {
        clienteB2bId: empresa.id,
        nombre: "Comprador Demo",
        email,
        passwordHash,
        rol: "admin",
      },
    });

    console.info(
      `Empresa B2B "${razonSocial}" (id=${empresa.id}) y usuario ${email} ` +
        `(id=${usuario.id}) sembrados en tenant ${slug}. Login web-b2b: ` +
        `tenant="${slug}", email="${email}".`,
    );
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
