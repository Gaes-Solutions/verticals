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

export const iniciarCheckoutSchema = z.object({
  carritoId: z.string().min(1),
  emailComprador: z.string().email(),
  metodoPago: z.enum(["tarjeta", "oxxo", "spei", "transferencia", "cod"]).default("tarjeta"),
  proveedorPago: z.enum(["stripe", "conekta", "mock"]).default("mock"),
  metodoEnvio: z.enum(["paqueteria", "click_collect", "envio_local"]),
  sucursalPickupId: z.string().optional(),
  direccionEnvio: direccionSchema.optional(),
  // El costo de envío se calcula server-side a partir de la tarifa elegida;
  // sin tarifa (tenant sin envíos configurados) el costo es 0.
  tarifaEnvioId: z.string().optional(),
  // Pago con tarjeta: token de Conekta.js/Stripe.js (la tarjeta nunca toca el
  // backend) + meses sin intereses opcionales.
  cardTokenId: z.string().optional(),
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
});

export const webhookSchema = z.object({
  payload: z.string().min(1),
  signature: z.string().min(1),
  proveedorPago: z.enum(["stripe", "conekta", "mock"]).default("mock"),
});

export type IniciarCheckoutInput = z.infer<typeof iniciarCheckoutSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
