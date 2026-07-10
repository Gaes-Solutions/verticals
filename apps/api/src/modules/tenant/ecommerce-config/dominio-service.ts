import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import type { MasterPrismaClient } from "@gaespos/db";

const VERIFY_PREFIX = "_gaessoft-verify";

/** Apex de la plataforma para subdominios de tienda (ej. "mitienda.gaessoft.shop"). */
function apexPlataforma(): string | null {
  return process.env.STOREFRONT_APEX?.trim() || null;
}

/** Destino CNAME recomendado para apuntar el dominio propio a la plataforma. */
function cnameTarget(): string {
  return process.env.STOREFRONT_CNAME_TARGET?.trim() || "stores.gaessoft.mx";
}

export function tokenVerificacion(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Instrucciones DNS que el sistema recomienda al dueño para conectar y verificar
 * su dominio: un CNAME que enruta el tráfico y un TXT que prueba la propiedad.
 */
export function instruccionesDns(dominio: string, token: string | null) {
  return {
    cname: { tipo: "CNAME", host: dominio, valor: cnameTarget() },
    txt: token
      ? { tipo: "TXT", host: `${VERIFY_PREFIX}.${dominio}`, valor: `gaessoft-verify=${token}` }
      : null,
  };
}

/** Comprueba que el TXT de verificación exista con el token esperado. */
export async function verificarTxt(dominio: string, token: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`${VERIFY_PREFIX}.${dominio}`);
    return records.some((chunks) => chunks.join("").includes(`gaessoft-verify=${token}`));
  } catch {
    return false;
  }
}

interface SyncInput {
  subdominio: string;
  dominioPropio: string | null;
  dominioVerificado: boolean;
  /** dominio propio anterior, para limpiar el registro si cambió o se quitó */
  dominioPropioAnterior?: string | null;
}

/**
 * Mantiene el registro global host→tenant (master) alineado con la config de la
 * tienda: el subdominio de plataforma queda verificado de inmediato; el dominio
 * propio refleja su estado de verificación DNS.
 */
export async function sincronizarDominioMaster(
  master: MasterPrismaClient,
  tenantSlug: string,
  input: SyncInput,
): Promise<void> {
  const apex = apexPlataforma();
  if (apex) {
    const host = `${input.subdominio}.${apex}`.toLowerCase();
    await master.tiendaDominio.upsert({
      where: { host },
      create: { host, tenantSlug, tipo: "subdominio", verificado: true },
      update: { tenantSlug, tipo: "subdominio", verificado: true },
    });
  }

  const anterior = input.dominioPropioAnterior?.toLowerCase() ?? null;
  const actual = input.dominioPropio?.toLowerCase() ?? null;
  if (anterior && anterior !== actual) {
    await master.tiendaDominio.deleteMany({ where: { host: anterior, tipo: "propio" } });
  }
  if (actual) {
    await master.tiendaDominio.upsert({
      where: { host: actual },
      create: { host: actual, tenantSlug, tipo: "propio", verificado: input.dominioVerificado },
      update: { tenantSlug, tipo: "propio", verificado: input.dominioVerificado },
    });
  }
}

/** Resuelve el tenant dueño de un host verificado (para el storefront público). */
export async function resolverTenantPorHost(
  master: MasterPrismaClient,
  host: string,
): Promise<{ tenantSlug: string; tipo: string } | null> {
  const registro = await master.tiendaDominio.findFirst({
    where: { host: host.toLowerCase(), verificado: true },
    select: { tenantSlug: true, tipo: true },
  });
  return registro ?? null;
}
