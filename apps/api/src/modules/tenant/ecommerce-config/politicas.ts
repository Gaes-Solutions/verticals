import type { TenantPrismaClient } from "@gaespos/db";

export const CLAVES_POLITICAS = ["envios", "devoluciones", "privacidad", "terminos"] as const;
export type ClavePolitica = (typeof CLAVES_POLITICAS)[number];

export interface DatosNegocio {
  nombre: string;
  domicilio: string | null;
  correo: string | null;
  telefono: string | null;
}

function domicilioDeSucursal(direccion: unknown): string | null {
  if (!direccion || typeof direccion !== "object") return null;
  const d = direccion as Record<string, unknown>;
  const partes = ["calle", "numero", "colonia", "municipio", "ciudad", "estado", "cp"]
    .map((k) => (typeof d[k] === "string" ? (d[k] as string).trim() : ""))
    .filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

/** Los datos de contacto salen de lo que el negocio ya capturó: fiscales o sucursal. */
export async function datosDelNegocio(prisma: TenantPrismaClient): Promise<DatosNegocio> {
  const [tienda, fiscal, sucursal] = await Promise.all([
    prisma.configTiendaEcommerce.findFirst({ select: { nombre: true } }),
    prisma.cfdiConfig.findFirst({
      select: {
        razonSocialEmisor: true,
        correoEmisor: true,
        telefonoEmisor: true,
        codigoPostalEmisor: true,
      },
    }),
    prisma.sucursal.findFirst({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { direccion: true, telefono: true, emailContacto: true },
    }),
  ]);
  const cp = fiscal?.codigoPostalEmisor ? `C.P. ${fiscal.codigoPostalEmisor}` : null;
  return {
    nombre: fiscal?.razonSocialEmisor || tienda?.nombre || "nuestra tienda",
    domicilio: domicilioDeSucursal(sucursal?.direccion) ?? cp,
    correo: fiscal?.correoEmisor || sucursal?.emailContacto || null,
    telefono: fiscal?.telefonoEmisor || sucursal?.telefono || null,
  };
}

/**
 * Texto base para cada política, con los datos del negocio ya puestos. El dueño lo
 * revisa y lo ajusta desde el panel: aquí solo se le evita empezar de cero.
 */
export function politicasSugeridas(d: DatosNegocio): Record<ClavePolitica, string> {
  const contacto = [
    d.correo ? `correo ${d.correo}` : null,
    d.telefono ? `teléfono ${d.telefono}` : null,
  ].filter(Boolean);
  const comoContactar = contacto.length
    ? `Puedes contactarnos por ${contacto.join(" o ")}.`
    : "Puedes contactarnos por los medios publicados en esta tienda.";
  const domicilio = d.domicilio ? ` con domicilio en ${d.domicilio}` : "";

  return {
    envios: [
      `${d.nombre} realiza envíos dentro de la República Mexicana.`,
      "El costo y el tiempo estimado de entrega se calculan al pagar, según tu código postal y el peso del pedido.",
      "Los pedidos se preparan en días hábiles. Cuando tu pedido se entrega a la paquetería te compartimos el número de guía para que lo rastrees.",
      "Si elegiste recoger en tienda, te avisamos en cuanto tu pedido esté listo.",
      comoContactar,
    ].join("\n\n"),
    devoluciones: [
      "Si tu producto llegó dañado, incompleto o no corresponde a lo que pediste, solicita el cambio o la devolución dentro de los 5 días naturales posteriores a la entrega desde la sección Mis pedidos de tu cuenta.",
      "El producto debe estar sin uso y con su empaque original. Una vez que recibimos y revisamos el producto, el reembolso se hace por el mismo medio de pago con el que compraste.",
      "Los productos de higiene personal y los artículos personalizados no tienen cambio ni devolución, salvo defecto de fábrica.",
      "Esto no limita los derechos que te otorga la Ley Federal de Protección al Consumidor.",
      comoContactar,
    ].join("\n\n"),
    privacidad: [
      `${d.nombre}${domicilio} es responsable del tratamiento de tus datos personales.`,
      "Qué datos recabamos: nombre, correo, teléfono, domicilio de entrega y los datos de facturación que nos proporciones. No almacenamos los datos de tu tarjeta: el cobro lo procesa una plataforma de pagos certificada.",
      "Para qué los usamos: procesar y entregar tus pedidos, emitir tu factura, atender aclaraciones y mantenerte informado sobre el estado de tu compra.",
      "Con quién los compartimos: únicamente con las paqueterías que entregan tu pedido y con el procesador de pagos, y solo lo necesario para cumplir tu compra. No los vendemos ni los compartimos con fines publicitarios de terceros.",
      `Tus derechos ARCO: puedes acceder, rectificar, cancelar u oponerte al uso de tus datos, así como revocar tu consentimiento. ${comoContactar} Responderemos tu solicitud en los plazos que marca la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.`,
      "Cambios: si modificamos este aviso, publicaremos la versión actualizada en esta misma página.",
    ].join("\n\n"),
    terminos: [
      `Estos términos aplican a las compras realizadas en la tienda en línea de ${d.nombre}${domicilio}.`,
      "Precios: se muestran en pesos mexicanos e incluyen IVA. Pueden cambiar sin previo aviso, salvo los de pedidos ya confirmados.",
      "Disponibilidad: las existencias pueden agotarse. Si un producto no está disponible después de tu compra, te avisamos y te devolvemos el importe correspondiente.",
      "Pago y confirmación: tu pedido se confirma cuando el pago queda acreditado. Recibirás la confirmación en el correo que registraste.",
      "Envíos, cambios y devoluciones: se rigen por las políticas publicadas en esta tienda.",
      "Facturación: puedes solicitar tu factura con tus datos fiscales durante el periodo que indica la ley.",
      "Para cualquier aclaración, la Procuraduría Federal del Consumidor (PROFECO) es la instancia competente en materia de consumo.",
      comoContactar,
    ].join("\n\n"),
  };
}

/** Lo capturado por el negocio manda; lo vacío se cubre con el texto base. */
export function politicasParaPublicar(
  guardadas: unknown,
  sugeridas: Record<ClavePolitica, string>,
): Record<string, string> {
  const propias = (guardadas ?? {}) as Record<string, unknown>;
  const resultado: Record<string, string> = {};
  for (const clave of CLAVES_POLITICAS) {
    const propia = typeof propias[clave] === "string" ? (propias[clave] as string).trim() : "";
    resultado[clave] = propia || sugeridas[clave];
  }
  for (const [clave, valor] of Object.entries(propias)) {
    if (!(clave in resultado) && typeof valor === "string" && valor.trim())
      resultado[clave] = valor;
  }
  return resultado;
}
