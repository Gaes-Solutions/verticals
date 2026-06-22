import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

const DIA_MS = 86_400_000;
const COBERTURA_OBJETIVO = 30; // días de inventario que queremos mantener
const UMBRAL_AGOTAMIENTO = 14; // alerta si se agota en <= N días

export interface ItemReorden {
  varianteId: string;
  sku: string;
  nombre: string;
  stock: number;
  vendido: number;
  velocidadDia: number;
  diasParaAgotarse: number;
  sugerenciaReorden: number;
}
export interface ItemEstancado {
  varianteId: string;
  sku: string;
  nombre: string;
  stock: number;
  valorInmovilizado: number;
}
export interface ItemTop {
  varianteId: string;
  sku: string;
  nombre: string;
  vendido: number;
  margenUnit: number;
  margenTotal: number;
}

export interface InventarioInsights {
  dias: number;
  porAgotarse: ItemReorden[];
  estancados: ItemEstancado[];
  topVendidos: ItemTop[];
}

interface VarInfo {
  sku: string;
  nombre: string;
  precio: number;
  costo: number;
}

export async function analizarInventario(
  client: TenantClient,
  dias: number,
): Promise<InventarioInsights> {
  const desde = new Date(Date.now() - dias * DIA_MS);

  // Unidades vendidas por variante en el periodo (ventas no canceladas).
  const ventas = await client.ventaLinea.groupBy({
    by: ["varianteId"],
    where: { venta: { createdAt: { gte: desde }, canceladaAt: null } },
    _sum: { cantidad: true },
  });
  const vendidoPorVar = new Map<string, number>();
  for (const v of ventas) vendidoPorVar.set(v.varianteId, Number(v._sum?.cantidad ?? 0));

  // Stock actual por variante (suma de sucursales).
  const stocks = await client.inventarioSucursal.groupBy({
    by: ["varianteId"],
    _sum: { stockActual: true },
  });
  const stockPorVar = new Map<string, number>();
  for (const s of stocks) stockPorVar.set(s.varianteId, Number(s._sum?.stockActual ?? 0));

  // Info de las variantes involucradas.
  const ids = new Set<string>([...vendidoPorVar.keys(), ...stockPorVar.keys()]);
  const variantes = await client.productoVariante.findMany({
    where: { id: { in: [...ids] }, isActive: true },
    select: {
      id: true,
      sku: true,
      nombreVariante: true,
      precioBase: true,
      costoPromedio: true,
      producto: { select: { nombre: true } },
    },
  });
  const info = new Map<string, VarInfo>();
  for (const v of variantes) {
    info.set(v.id, {
      sku: v.sku,
      nombre: v.nombreVariante ? `${v.producto.nombre} · ${v.nombreVariante}` : v.producto.nombre,
      precio: Number(v.precioBase),
      costo: Number(v.costoPromedio),
    });
  }

  const porAgotarse: ItemReorden[] = [];
  const estancados: ItemEstancado[] = [];
  const topVendidos: ItemTop[] = [];

  for (const v of variantes) {
    const meta = info.get(v.id);
    if (!meta) continue;
    const vendido = vendidoPorVar.get(v.id) ?? 0;
    const stock = stockPorVar.get(v.id) ?? 0;
    const velocidad = vendido / dias;

    if (velocidad > 0) {
      const diasParaAgotarse = stock / velocidad;
      if (diasParaAgotarse <= UMBRAL_AGOTAMIENTO) {
        const sugerencia = Math.max(0, Math.ceil(velocidad * COBERTURA_OBJETIVO - stock));
        porAgotarse.push({
          varianteId: v.id,
          sku: meta.sku,
          nombre: meta.nombre,
          stock,
          vendido,
          velocidadDia: Math.round(velocidad * 100) / 100,
          diasParaAgotarse: Math.round(diasParaAgotarse * 10) / 10,
          sugerenciaReorden: sugerencia,
        });
      }
      topVendidos.push({
        varianteId: v.id,
        sku: meta.sku,
        nombre: meta.nombre,
        vendido,
        margenUnit: Math.round((meta.precio - meta.costo) * 100) / 100,
        margenTotal: Math.round((meta.precio - meta.costo) * vendido * 100) / 100,
      });
    } else if (stock > 0) {
      estancados.push({
        varianteId: v.id,
        sku: meta.sku,
        nombre: meta.nombre,
        stock,
        valorInmovilizado: Math.round(meta.costo * stock * 100) / 100,
      });
    }
  }

  porAgotarse.sort((a, b) => a.diasParaAgotarse - b.diasParaAgotarse);
  estancados.sort((a, b) => b.valorInmovilizado - a.valorInmovilizado);
  topVendidos.sort((a, b) => b.margenTotal - a.margenTotal);

  return {
    dias,
    porAgotarse: porAgotarse.slice(0, 50),
    estancados: estancados.slice(0, 50),
    topVendidos: topVendidos.slice(0, 15),
  };
}
