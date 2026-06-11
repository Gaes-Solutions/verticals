import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().min(1) });

export const zonaEnvioSchema = z.object({
  nombre: z.string().min(1).max(120),
  cpsIncluidos: z.array(z.string().regex(/^\d{5}$/)).optional(),
  estadosIncluidos: z.array(z.string().min(2).max(40)).optional(),
  isActive: z.boolean().optional(),
});

const escalonSchema = z.object({
  // hasta=null → escalón final abierto
  hasta: z.number().positive().nullable(),
  costo: z.number().nonnegative(),
});

export const tarifaEnvioSchema = z.object({
  zonaEnvioId: z.string().min(1),
  paqueteria: z.enum(["fedex", "estafeta", "paquete_express", "huipix", "propio"]),
  nombrePublico: z.string().min(1).max(120),
  tipoCalculo: z.enum(["fija", "por_peso", "por_monto"]).default("fija"),
  montoFijo: z.number().nonnegative().optional(),
  escalones: z.array(escalonSchema).optional(),
  montoMinimoEnvioGratis: z.number().positive().optional(),
  diasEntregaEstimados: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const pickupConfigSchema = z.object({
  activa: z.boolean().optional(),
  horarioPickup: z.record(z.string()).optional(),
  tiempoPreparacionPromedioMin: z.number().int().positive().optional(),
  requiereIdRecoger: z.boolean().optional(),
  notificacionListoCanal: z.enum(["email", "sms", "whatsapp"]).optional(),
});

export const cotizarQuerySchema = z.object({
  cp: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  estado: z.string().min(2).max(40).optional(),
  subtotal: z.coerce.number().nonnegative(),
  pesoKg: z.coerce.number().positive().optional(),
});

export const pedidoParamSchema = z.object({ pedidoId: z.string().min(1) });

export const generarGuiaSchema = z.object({
  proveedor: z.enum(["skydropx", "envia", "mock"]).optional(),
  rateId: z.string().min(1).optional(),
});

export const webhookEnvioSchema = z.object({
  paqueteria: z.enum(["skydropx", "envia", "mock"]),
  payload: z.string().min(1),
  signature: z.string().min(1),
});

export const cotizarVivoQuerySchema = z.object({
  cp: z.string().regex(/^\d{5}$/),
  estado: z.string().min(2).max(40),
  pesoKg: z.coerce.number().positive().optional(),
});

export type ZonaEnvioInput = z.infer<typeof zonaEnvioSchema>;
export type TarifaEnvioInput = z.infer<typeof tarifaEnvioSchema>;
export type PickupConfigInput = z.infer<typeof pickupConfigSchema>;
export type CotizarQuery = z.infer<typeof cotizarQuerySchema>;
