import type { TenantPrismaClient } from "@gaespos/db";
import type { PaymentProvider } from "@gaespos/pagos";

// "Mis tarjetas": tarjetas guardadas del comprador para pagar en 1 toque.
//
// PCI: jamás persistimos PAN ni CVV. De la tarjeta solo guardamos los ids que
// Conekta nos devuelve (customer/source) y la máscara (marca + últimos 4 +
// expiración) para mostrársela al cliente. El PAN/CVV viajan solo entre el
// navegador y Conekta (tokenización con Conekta.js).
//
// Solo Conekta soporta guardar tarjetas hoy: Stripe y mock responden 422 en la
// ruta. La extensión a otros proveedores es aditiva (misma tabla, distinto
// valor en `proveedor`).

export class MedioPagoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "MedioPagoError";
  }
}

export interface MedioPagoGuardado {
  id: string;
  marca: string;
  last4: string;
  expMes: number;
  expAnio: number;
}

interface MedioPagoRow {
  id: string;
  marca: string;
  last4: string;
  expMes: number;
  expAnio: number;
}

/** DTO enmascarado: lo único que sale del backend hacia el cliente. */
export function enmascararMedioPago(row: MedioPagoRow): MedioPagoGuardado {
  return {
    id: row.id,
    marca: row.marca,
    last4: row.last4,
    expMes: row.expMes,
    expAnio: row.expAnio,
  };
}

/** Violación de unique (clienteId, proveedorSourceId): la fuente ya existe. */
export function esDuplicadoMedioPago(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export async function listarMediosPago(
  client: TenantPrismaClient,
  clienteId: string,
): Promise<MedioPagoGuardado[]> {
  const rows = await client.clienteMedioPago.findMany({
    where: { clienteId, activo: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, marca: true, last4: true, expMes: true, expAnio: true },
  });
  return rows.map(enmascararMedioPago);
}

/**
 * Guarda la tarjeta tokenizada (cardTokenId de Conekta.js) como fuente reusable
 * del cliente. Idempotente por construcción: si Conekta devuelve una fuente que
 * ya tenemos persistida (mismo proveedorSourceId), no duplica y devuelve la
 * existente (reactivándola si fue dada de baja).
 */
export async function agregarMedioPago(
  client: TenantPrismaClient,
  provider: PaymentProvider | null,
  clienteId: string,
  cardTokenId: string,
): Promise<MedioPagoGuardado> {
  const cfg = await client.configTiendaEcommerce.findFirst({
    select: { pasarelaPagoProvider: true },
  });
  if (cfg?.pasarelaPagoProvider !== "conekta") {
    throw new MedioPagoError(
      422,
      "Guardar tarjetas no está soportado para el proveedor de pago de esta tienda",
    );
  }
  if (
    !provider ||
    provider.codigo !== "conekta" ||
    typeof provider.crearCliente !== "function" ||
    typeof provider.agregarFuentePago !== "function"
  ) {
    throw new MedioPagoError(503, "El guardado de tarjetas no está disponible en este momento");
  }
  const cliente = await client.cliente.findUnique({
    where: { id: clienteId },
    select: { nombre: true, apellidos: true, emailPrincipal: true, isActive: true },
  });
  if (!cliente?.isActive) throw new MedioPagoError(404, "Cliente no encontrado");
  if (!cliente.emailPrincipal) {
    throw new MedioPagoError(422, "Completa tu cuenta con un correo antes de guardar tarjetas");
  }

  // Reutiliza el customer de Conekta de una tarjeta previa: un cliente = un
  // customer por proveedor. Si es su primera tarjeta, se crea ahora.
  const previa = await client.clienteMedioPago.findFirst({
    where: { clienteId, proveedor: provider.codigo },
    orderBy: { createdAt: "asc" },
    select: { proveedorCustomerId: true },
  });
  const proveedorCustomerId = previa
    ? previa.proveedorCustomerId
    : (
        await provider.crearCliente({
          nombre: `${cliente.nombre} ${cliente.apellidos ?? ""}`.trim(),
          email: cliente.emailPrincipal,
        })
      ).customerId;

  const fuente = await provider.agregarFuentePago(proveedorCustomerId, cardTokenId);
  const select = { id: true, marca: true, last4: true, expMes: true, expAnio: true } as const;
  try {
    const row = await client.clienteMedioPago.create({
      data: {
        clienteId,
        proveedor: provider.codigo,
        proveedorCustomerId,
        proveedorSourceId: fuente.sourceId,
        marca: fuente.marca,
        last4: fuente.last4,
        expMes: fuente.expMes,
        expAnio: fuente.expAnio,
      },
      select,
    });
    return enmascararMedioPago(row);
  } catch (err) {
    if (!esDuplicadoMedioPago(err)) throw err;
    // Misma fuente ya persistida: no duplicar. Si estaba dada de baja, la
    // reactivamos (la fuente sigue viva en Conekta).
    const existente = await client.clienteMedioPago.findUnique({
      where: {
        clienteId_proveedorSourceId: {
          clienteId,
          proveedorSourceId: fuente.sourceId,
        },
      },
      select: { ...select, activo: true },
    });
    if (!existente) throw err;
    if (!existente.activo) {
      const reactivada = await client.clienteMedioPago.update({
        where: { id: existente.id },
        data: { activo: true },
        select,
      });
      return enmascararMedioPago(reactivada);
    }
    return enmascararMedioPago(existente);
  }
}

/**
 * Da de baja una tarjeta guardada: valida propiedad, la elimina en el proveedor
 * y marca activo=false (la fila se conserva para trazabilidad; nunca cobramos
 * una fuente dada de baja). Idempotente: repetir la baja no falla.
 */
export async function eliminarMedioPago(
  client: TenantPrismaClient,
  provider: PaymentProvider | null,
  clienteId: string,
  id: string,
): Promise<void> {
  const row = await client.clienteMedioPago.findUnique({ where: { id } });
  if (!row || row.clienteId !== clienteId) {
    throw new MedioPagoError(404, "Tarjeta no encontrada");
  }
  if (!row.activo) return;
  // Sin proveedor disponible (p.ej. keys de Conekta retiradas) igual se asienta
  // la baja local: el checkout solo usa fuentes activas.
  if (
    provider &&
    provider.codigo === row.proveedor &&
    typeof provider.eliminarFuentePago === "function"
  ) {
    await provider.eliminarFuentePago(row.proveedorCustomerId, row.proveedorSourceId);
  }
  await client.clienteMedioPago.update({ where: { id }, data: { activo: false } });
}
