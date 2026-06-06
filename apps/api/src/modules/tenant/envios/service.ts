import type { TenantPrismaClient } from "@gaespos/db";

export class EnviosError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "EnviosError";
  }
}

interface Escalon {
  hasta: number | null;
  costo: number;
}

export interface OpcionEnvioDto {
  tarifaId: string;
  nombrePublico: string;
  paqueteria: string;
  zonaNombre: string;
  costo: string;
  gratis: boolean;
  diasEntregaEstimados: number | null;
}

export interface OpcionPickupDto {
  sucursalId: string;
  nombre: string;
  direccion: unknown;
  horarioPickup: unknown;
  tiempoPreparacionPromedioMin: number;
  requiereIdRecoger: boolean;
}

export interface CotizacionEnvioDto {
  opcionesEnvio: OpcionEnvioDto[];
  pickup: OpcionPickupDto[];
}

function costoPorEscalones(escalones: Escalon[], valor: number): number | null {
  const ordenados = [...escalones].sort((a, b) => {
    if (a.hasta === null) return 1;
    if (b.hasta === null) return -1;
    return a.hasta - b.hasta;
  });
  for (const e of ordenados) {
    if (e.hasta === null || valor <= e.hasta) return e.costo;
  }
  return null;
}

/**
 * Especificidad de zona: CP exacto > estado > catch-all (zona sin CPs ni
 * estados configurados aplica a todo el país). Sin match → la zona no aplica.
 */
function especificidadZona(
  zona: { cpsIncluidos: unknown; estadosIncluidos: unknown },
  cp: string | undefined,
  estado: string | undefined,
): number {
  const cps = Array.isArray(zona.cpsIncluidos) ? (zona.cpsIncluidos as string[]) : [];
  const estados = Array.isArray(zona.estadosIncluidos) ? (zona.estadosIncluidos as string[]) : [];
  if (cp && cps.includes(cp)) return 3;
  if (estado && estados.some((e) => e.toLowerCase() === estado.toLowerCase())) return 2;
  if (cps.length === 0 && estados.length === 0) return 1;
  return 0;
}

export async function cotizarEnvio(
  prisma: TenantPrismaClient,
  input: {
    cp?: string | undefined;
    estado?: string | undefined;
    subtotal: number;
    pesoKg?: number | undefined;
  },
): Promise<CotizacionEnvioDto> {
  const [zonas, pickups] = await Promise.all([
    prisma.zonaEnvio.findMany({
      where: { isActive: true },
      include: { tarifas: { where: { isActive: true } } },
    }),
    prisma.configPickupSucursal.findMany({
      where: { activa: true, sucursal: { isActive: true } },
      include: { sucursal: { select: { id: true, nombre: true, direccion: true } } },
    }),
  ]);

  const puntuadas = zonas
    .map((z) => ({ zona: z, score: especificidadZona(z, input.cp, input.estado) }))
    .filter((z) => z.score > 0);
  const mejorScore = Math.max(0, ...puntuadas.map((z) => z.score));
  const aplicables = puntuadas.filter((z) => z.score === mejorScore);

  const opcionesEnvio: OpcionEnvioDto[] = [];
  for (const { zona } of aplicables) {
    for (const tarifa of zona.tarifas) {
      let costo: number | null = null;
      if (tarifa.tipoCalculo === "fija") {
        costo = tarifa.montoFijo ? Number(tarifa.montoFijo) : 0;
      } else if (tarifa.tipoCalculo === "por_monto") {
        const escalones = (tarifa.escalonPeso ?? []) as unknown as Escalon[];
        costo = costoPorEscalones(escalones, input.subtotal);
      } else if (tarifa.tipoCalculo === "por_peso") {
        if (input.pesoKg === undefined) continue;
        const escalones = (tarifa.escalonPeso ?? []) as unknown as Escalon[];
        costo = costoPorEscalones(escalones, input.pesoKg);
      }
      if (costo === null) continue;
      const gratis =
        tarifa.montoMinimoEnvioGratis !== null &&
        input.subtotal >= Number(tarifa.montoMinimoEnvioGratis);
      opcionesEnvio.push({
        tarifaId: tarifa.id,
        nombrePublico: tarifa.nombrePublico,
        paqueteria: tarifa.paqueteria,
        zonaNombre: zona.nombre,
        costo: (gratis ? 0 : costo).toFixed(2),
        gratis,
        diasEntregaEstimados: tarifa.diasEntregaEstimados,
      });
    }
  }
  opcionesEnvio.sort((a, b) => Number(a.costo) - Number(b.costo));

  const pickup: OpcionPickupDto[] = pickups.map((p) => ({
    sucursalId: p.sucursal.id,
    nombre: p.sucursal.nombre,
    direccion: p.sucursal.direccion,
    horarioPickup: p.horarioPickup,
    tiempoPreparacionPromedioMin: p.tiempoPreparacionPromedioMin,
    requiereIdRecoger: p.requiereIdRecoger,
  }));

  return { opcionesEnvio, pickup };
}

/**
 * Valida server-side el costo de envío que manda el frontend al iniciar
 * checkout: debe corresponder a una opción cotizada real (anti-manipulación).
 */
export async function validarOpcionEnvio(
  prisma: TenantPrismaClient,
  input: {
    tarifaId: string;
    cp?: string | undefined;
    estado?: string | undefined;
    subtotal: number;
    pesoKg?: number | undefined;
  },
): Promise<OpcionEnvioDto> {
  const cotizacion = await cotizarEnvio(prisma, input);
  const opcion = cotizacion.opcionesEnvio.find((o) => o.tarifaId === input.tarifaId);
  if (!opcion) {
    throw new EnviosError(422, "La tarifa de envío no aplica para esta dirección");
  }
  return opcion;
}
