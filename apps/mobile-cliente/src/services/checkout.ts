import { api } from "@/lib/api";
import type { CheckoutAddress, CheckoutResult } from "@/lib/checkout-model";
export interface PaymentAttempt extends CheckoutResult {
  idempotencyKey: string;
  carritoId: string;
}
export interface DeliveryOptions {
  opcionesEnvio: {
    tarifaId: string;
    nombrePublico: string;
    paqueteria: string | null;
    costo: string;
    gratis: boolean;
    diasEntregaEstimados: number | null;
  }[];
  pickup: { sucursalId: string; nombre: string; tiempoPreparacionPromedioMin: number }[];
}
export interface CheckoutInput {
  carritoId: string;
  idempotencyKey: string;
  metodoPago: "oxxo" | "spei";
  metodoEnvio: "paqueteria" | "click_collect";
  tarifaEnvioId?: string;
  sucursalPickupId?: string;
  direccionEnvio?: CheckoutAddress;
}
const prefix = "/cliente-portal/comercio";
async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
export const deliveryOptions = (carritoId: string, cp: string, estado: string) =>
  bounded((signal) =>
    api.get<DeliveryOptions>(
      `${prefix}/envios?carritoId=${encodeURIComponent(carritoId)}${cp ? `&cp=${encodeURIComponent(cp)}` : ""}${estado ? `&estado=${encodeURIComponent(estado)}` : ""}`,
      { signal },
    ),
  );
export const paymentConfig = () =>
  bounded((signal) =>
    api.get<{ proveedor: string | null; metodos: string[]; tarjetaRequiereToken: boolean }>(
      `${prefix}/pago-config`,
      { signal },
    ),
  );
export const prepareCheckout = (carritoId: string) =>
  bounded((signal) =>
    api.post<{ idempotencyKey: string; carritoId: string }>(
      `${prefix}/checkout/preparar`,
      { carritoId },
      { signal },
    ),
  );
export const submitCheckout = (input: CheckoutInput) =>
  bounded((signal) => api.post<PaymentAttempt>(`${prefix}/checkout`, input, { signal }));
export const lookupCheckout = (key: string) =>
  bounded((signal) =>
    api.get<PaymentAttempt>(`${prefix}/checkout/intentos/${encodeURIComponent(key)}`, { signal }),
  );
export const latestCheckout = () =>
  bounded((signal) => api.get<PaymentAttempt>(`${prefix}/checkout/intento`, { signal }));
