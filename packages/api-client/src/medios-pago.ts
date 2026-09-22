import type { ApiClient } from "./client";

/** Tarjeta guardada ("Mis tarjetas"): solo máscara, nunca PAN/CVV. */
export interface MedioPagoGuardado {
  id: string;
  marca: string;
  last4: string;
  expMes: number;
  expAnio: number;
}

/** Lista las tarjetas guardadas del cliente autenticado. */
export function listarMediosPago(client: ApiClient): Promise<MedioPagoGuardado[]> {
  return client.get("/cliente-portal/medios-pago");
}

/** Guarda una tarjeta tokenizada (cardTokenId de Conekta.js) para pagar en 1 toque. */
export function agregarMedioPago(
  client: ApiClient,
  input: { cardTokenId: string },
): Promise<MedioPagoGuardado> {
  return client.post("/cliente-portal/medios-pago", input);
}

/** Da de baja una tarjeta guardada (baja lógica en el API). */
export function eliminarMedioPago(client: ApiClient, id: string): Promise<void> {
  return client.del(`/cliente-portal/medios-pago/${encodeURIComponent(id)}`);
}
