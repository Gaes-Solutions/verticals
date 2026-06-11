import type { TenantPrismaClient } from "@gaespos/db";

export interface DireccionInput {
  etiqueta: string;
  calle: string;
  numeroExterior?: string | undefined;
  numeroInterior?: string | undefined;
  colonia?: string | undefined;
  municipio?: string | undefined;
  estado: string;
  codigoPostal: string;
  pais?: string | undefined;
  referencias?: string | undefined;
  isDefaultEnvio?: boolean | undefined;
}

function data(input: DireccionInput) {
  return {
    etiqueta: input.etiqueta,
    calle: input.calle,
    numeroExterior: input.numeroExterior ?? null,
    numeroInterior: input.numeroInterior ?? null,
    colonia: input.colonia ?? null,
    municipio: input.municipio ?? null,
    estado: input.estado,
    codigoPostal: input.codigoPostal,
    pais: input.pais ?? "MX",
    referencias: input.referencias ?? null,
  };
}

export async function listarDirecciones(
  prisma: TenantPrismaClient,
  clienteId: string,
): Promise<unknown[]> {
  return prisma.clienteDireccion.findMany({
    where: { clienteId },
    orderBy: [{ isDefaultEnvio: "desc" }, { createdAt: "desc" }],
  });
}

/** Si se marca como default de envío, desmarca las demás del cliente (única default). */
async function aplicarDefault(
  prisma: TenantPrismaClient,
  clienteId: string,
  direccionId: string,
): Promise<void> {
  await prisma.clienteDireccion.updateMany({
    where: { clienteId, id: { not: direccionId } },
    data: { isDefaultEnvio: false },
  });
}

export async function crearDireccion(
  prisma: TenantPrismaClient,
  clienteId: string,
  input: DireccionInput,
): Promise<{ id: string }> {
  const existentes = await prisma.clienteDireccion.count({ where: { clienteId } });
  const esDefault = input.isDefaultEnvio || existentes === 0;
  const dir = await prisma.clienteDireccion.create({
    data: { clienteId, ...data(input), isDefaultEnvio: esDefault },
  });
  if (esDefault) await aplicarDefault(prisma, clienteId, dir.id);
  return dir;
}

export async function actualizarDireccion(
  prisma: TenantPrismaClient,
  clienteId: string,
  id: string,
  input: DireccionInput,
): Promise<boolean> {
  const existe = await prisma.clienteDireccion.findFirst({ where: { id, clienteId } });
  if (!existe) return false;
  await prisma.clienteDireccion.update({
    data: { ...data(input), ...(input.isDefaultEnvio ? { isDefaultEnvio: true } : {}) },
    where: { id },
  });
  if (input.isDefaultEnvio) await aplicarDefault(prisma, clienteId, id);
  return true;
}

export async function eliminarDireccion(
  prisma: TenantPrismaClient,
  clienteId: string,
  id: string,
): Promise<void> {
  await prisma.clienteDireccion.deleteMany({ where: { id, clienteId } });
}
