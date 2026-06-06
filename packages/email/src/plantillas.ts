import type { EmailPlantilla } from "./types.js";

/**
 * Render mínimo de plantillas transaccionales V1 (HTML inline simple).
 * V1.5: migrar a React Email para diseño rico. Mantiene asunto+html juntos.
 */
export function renderPlantilla(
  plantilla: EmailPlantilla,
  datos: Record<string, unknown>,
): { asunto: string; html: string; texto: string } {
  const v = (k: string): string => String(datos[k] ?? "");
  switch (plantilla) {
    case "pedido_confirmado":
      return {
        asunto: `Pedido ${v("folioPublico")} confirmado`,
        html: `<h1>¡Gracias por tu compra!</h1><p>Tu pedido <strong>${v("folioPublico")}</strong> por $${v("total")} fue confirmado.</p><p>Te avisaremos cuando se envíe.</p>`,
        texto: `Pedido ${v("folioPublico")} confirmado por $${v("total")}.`,
      };
    case "pedido_enviado":
      return {
        asunto: `Tu pedido ${v("folioPublico")} va en camino`,
        html: `<h1>Pedido enviado</h1><p>Guía: <strong>${v("guiaTracking")}</strong> (${v("paqueteria")}).</p>${
          v("trackingUrl") ? `<p><a href="${v("trackingUrl")}">Rastrear mi pedido</a></p>` : ""
        }`,
        texto: `Pedido ${v("folioPublico")} enviado. Guía ${v("guiaTracking")}.`,
      };
    case "pedido_listo_pickup":
      return {
        asunto: `Tu pedido ${v("folioPublico")} está listo para recoger`,
        html: `<h1>Listo para recoger</h1><p>Recoge tu pedido en ${v("sucursal")}.</p><p>Horario: ${v("horario")}.</p>`,
        texto: `Pedido ${v("folioPublico")} listo en ${v("sucursal")}.`,
      };
    case "carrito_recovery":
      return {
        asunto: "¿Olvidaste algo en tu carrito?",
        html: `<h1>Tu carrito te espera</h1><p>Dejaste productos en tu carrito. Recupéralos y completa tu compra cuando quieras.</p>${
          v("urlCarrito") ? `<p><a href="${v("urlCarrito")}">Volver a mi carrito</a></p>` : ""
        }`,
        texto: `Dejaste productos en tu carrito. Código de recuperación: ${v("recoveryCodigo")}.`,
      };
    case "resena_solicitud":
      return {
        asunto: "¿Qué te pareció tu compra?",
        html: `<h1>Cuéntanos tu experiencia</h1><p>Deja una reseña de los productos de tu pedido ${v("folioPublico")}.</p>`,
        texto: `Deja tu reseña del pedido ${v("folioPublico")}.`,
      };
    default:
      return { asunto: "Notificación", html: "<p>Notificación</p>", texto: "Notificación" };
  }
}
