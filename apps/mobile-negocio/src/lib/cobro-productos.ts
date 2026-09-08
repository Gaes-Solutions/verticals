import type { ProductoPOS } from "../services/negocio";

export interface OpcionCobro {
  varianteId: string;
  nombre: string;
  sku: string;
  precio: number;
}

/** Precio informativo: la cotización de venta sigue siendo autoridad para cobrar. */
export function opcionesCobro(productos: ProductoPOS[]): OpcionCobro[] {
  return productos.flatMap((product) => {
    if (product.isActive !== true || product.archivedAt != null) return [];
    return product.variantes.flatMap((variant) => {
      if (variant.isActive !== true || variant.archivedAt != null || !variant.id || !variant.sku)
        return [];
      if (
        typeof variant.precioBase !== "string" ||
        !/^\d{1,10}(\.\d{1,4})?$/.test(variant.precioBase)
      )
        return [];
      const precio = Number(variant.precioBase);
      if (!Number.isFinite(precio) || precio < 0) return [];
      const presentation = variant.nombreVariante?.trim() || variant.sku;
      return [
        {
          varianteId: variant.id,
          nombre: `${product.nombre} · ${presentation}`,
          sku: variant.sku,
          precio,
        },
      ];
    });
  });
}

export function agregarOpcion<T extends { varianteId: string; cantidad: number }>(
  items: T[],
  option: OpcionCobro,
): Array<T | (OpcionCobro & { cantidad: number })> {
  return items.some((item) => item.varianteId === option.varianteId)
    ? items.map((item) =>
        item.varianteId === option.varianteId ? { ...item, cantidad: item.cantidad + 1 } : item,
      )
    : [...items, { ...option, cantidad: 1 }];
}
