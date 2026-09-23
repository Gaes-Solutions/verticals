import { z } from "zod";

const direccionSchema = z.object({
  nombre: z.string().min(1),
  calle: z.string().min(1),
  numero: z.string().optional(),
  colonia: z.string().optional(),
  ciudad: z.string().min(1),
  estado: z.string().min(1),
  cp: z.string().min(4).max(5),
  telefono: z.string().optional(),
  referencias: z.string().optional(),
});

export const iniciarCheckoutSchema = z
  .object({
    carritoId: z.string().min(1),
    idempotencyKey: z.string().uuid().optional(),
    emailComprador: z.string().email(),
    metodoPago: z.enum(["tarjeta", "oxxo", "spei", "transferencia", "cod"]).default("tarjeta"),
    proveedorPago: z.enum(["stripe", "conekta", "mock"]),
    metodoEnvio: z.enum(["paqueteria", "click_collect", "envio_local"]),
    sucursalPickupId: z.string().optional(),
    direccionEnvio: direccionSchema.optional(),
    // El costo de envío se calcula server-side a partir de la tarifa elegida;
    // sin tarifa (tenant sin envíos configurados) el costo es 0.
    tarifaEnvioId: z.string().optional(),
    // Pago con tarjeta: token de Conekta.js/Stripe.js (la tarjeta nunca toca el
    // backend) + meses sin intereses opcionales. Excluyente con medioPagoGuardadoId.
    cardTokenId: z.string().optional(),
    // Pago con tarjeta guardada ("Mis tarjetas"): id local de ClienteMedioPago.
    // Excluyente con cardTokenId; solo aplica con metodoPago "tarjeta".
    medioPagoGuardadoId: z.string().optional(),
    mesesSinIntereses: z.number().int().min(3).max(48).optional(),
    requiereFactura: z.boolean().default(false),
    datosFactura: z
      .object({
        rfc: z.string().min(12).max(13),
        razonSocial: z.string().min(1),
        usoCfdi: z.string().min(1),
        regimenFiscal: z.string().min(1),
        cp: z.string().min(4).max(5),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.metodoPago !== "tarjeta" && val.medioPagoGuardadoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "medioPagoGuardadoId solo aplica cuando el método de pago es tarjeta",
        path: ["medioPagoGuardadoId"],
      });
    }
    if (val.cardTokenId && val.medioPagoGuardadoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Usa la tarjeta guardada o una tarjeta nueva, no ambas",
        path: ["medioPagoGuardadoId"],
      });
    }
  });

export const webhookSchema = z.object({
  payload: z.string().min(1),
  signature: z.string().min(1),
  proveedorPago: z.enum(["stripe", "conekta", "mock"]),
});

export type IniciarCheckoutInput = z.infer<typeof iniciarCheckoutSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;

/**
 * Con cobro real, la tarjeta exige exactamente una fuente: el token del
 * frontend o una tarjeta guardada. No va en el esquema porque primero hay que
 * saber si el negocio tiene proveedor configurado: si no lo tiene, lo que
 * corresponde es decir que el pago no está disponible, no reclamar un dato que
 * el comprador no puede dar.
 */
export function faltaFuenteDeTarjeta(
  body: Pick<
    z.infer<typeof iniciarCheckoutSchema>,
    "metodoPago" | "proveedorPago" | "cardTokenId" | "medioPagoGuardadoId"
  >,
): string | null {
  if (body.metodoPago !== "tarjeta" || body.proveedorPago === "mock") return null;
  const fuentes = Number(Boolean(body.cardTokenId)) + Number(Boolean(body.medioPagoGuardadoId));
  return fuentes === 1
    ? null
    : "Pago con tarjeta requiere exactamente una fuente: cardTokenId o medioPagoGuardadoId";
}
