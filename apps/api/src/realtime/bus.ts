import { EventEmitter } from "node:events";

/**
 * Bus de tiempo real in-process para SSE. Los canales se identifican por el id
 * del destinatario (cuid, único entre tenants): `u:<usuarioId>` para empleados,
 * `c:<clienteId>` para clientes de la tienda. Cada conexión SSE se suscribe a su
 * propio canal; al crear una notificación o mensaje se publica una señal y el
 * front refresca. Para múltiples instancias se cambiaría a Redis pub/sub
 * manteniendo esta misma interfaz.
 */
export interface RealtimeEvent {
  type: "notificacion" | "mensaje" | "pedido";
  [key: string]: unknown;
}

const emitter = new EventEmitter();
// Sin límite práctico: cada cliente/empleado conectado agrega un listener.
emitter.setMaxListeners(0);

export function canalUsuario(usuarioId: string): string {
  return `u:${usuarioId}`;
}

export function canalCliente(clienteId: string): string {
  return `c:${clienteId}`;
}

export function publish(canal: string, event: RealtimeEvent): void {
  emitter.emit(canal, event);
}

export function subscribe(canal: string, handler: (event: RealtimeEvent) => void): () => void {
  emitter.on(canal, handler);
  return () => emitter.off(canal, handler);
}
