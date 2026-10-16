import type { EmailPlantilla } from "./types.js";

/**
 * Render mínimo de plantillas transaccionales V1 (HTML inline simple).
 * V1.5: migrar a React Email para diseño rico. Mantiene asunto+html juntos.
 */
export function renderPlantilla(
  plantilla: EmailPlantilla,
  datos: Record<string, unknown>,
): { asunto: string; html: string; texto: string } {
  const text = (k: string): string => String(datos[k] ?? "");
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
    );
  const v = (k: string) => escapeHtml(text(k));
  const link = (k: string) => {
    try {
      const url = new URL(text(k));
      return ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : "";
    } catch {
      return "";
    }
  };
  switch (plantilla) {
    case "pedido_confirmado":
      return {
        asunto: `Pedido ${text("folioPublico")} confirmado`,
        html: `<h1>¡Gracias por tu compra!</h1><p>Tu pedido <strong>${v("folioPublico")}</strong> por $${v("total")} fue confirmado.</p><p>Te avisaremos cuando se envíe.</p>`,
        texto: `Pedido ${text("folioPublico")} confirmado por $${text("total")}.`,
      };
    case "pedido_enviado":
      return {
        asunto: `Tu pedido ${text("folioPublico")} va en camino`,
        html: `<h1>Pedido enviado</h1><p>Guía: <strong>${v("guiaTracking")}</strong> (${v("paqueteria")}).</p>${
          link("trackingUrl")
            ? `<p><a href="${link("trackingUrl")}">Rastrear mi pedido</a></p>`
            : ""
        }`,
        texto: `Pedido ${text("folioPublico")} enviado. Guía ${text("guiaTracking")}.`,
      };
    case "pedido_listo_pickup":
      return {
        asunto: `Tu pedido ${text("folioPublico")} está listo para recoger`,
        html: `<h1>Listo para recoger</h1><p>Recoge tu pedido en ${v("sucursal")}.</p><p>Horario: ${v("horario")}.</p>`,
        texto: `Pedido ${text("folioPublico")} listo en ${text("sucursal")}.`,
      };
    case "carrito_recovery":
      return {
        asunto: "¿Olvidaste algo en tu carrito?",
        html: `<h1>Tu carrito te espera</h1><p>Dejaste productos en tu carrito. Recupéralos y completa tu compra cuando quieras.</p>${
          link("urlCarrito")
            ? `<p><a href="${link("urlCarrito")}">Volver a mi carrito</a></p>`
            : `<p>Código de recuperación: ${v("recoveryCodigo")}</p>`
        }`,
        texto: link("urlCarrito")
          ? `Dejaste productos en tu carrito. Recupera tu compra: ${text("urlCarrito")}`
          : `Dejaste productos en tu carrito. Código de recuperación: ${text("recoveryCodigo")}.`,
      };
    case "resena_solicitud":
      return {
        asunto: "¿Qué te pareció tu compra?",
        html: `<h1>Cuéntanos tu experiencia</h1><p>Deja una reseña de los productos de tu pedido ${v("folioPublico")}.</p>`,
        texto: `Deja tu reseña del pedido ${text("folioPublico")}.`,
      };
    case "stock_disponible":
      return {
        asunto: `¡${text("producto")} volvió a estar disponible!`,
        html: `<h1>¡Buenas noticias!</h1><p><strong>${v("producto")}</strong> que esperabas ya tiene stock. Apúrate antes de que se agote.</p><p><a href="/producto/${escapeHtml(encodeURIComponent(text("slug")))}">Ver producto</a></p>`,
        texto: `${text("producto")} ya está disponible.`,
      };
    case "recuperar_contrasena":
      return {
        asunto: "Recupera tu contraseña",
        html: `<h1>Restablece tu contraseña</h1><p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace es válido por 1 hora y solo se puede usar una vez.</p><p><a href="${link("url")}">Restablecer mi contraseña</a></p><p>Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p>`,
        texto: `Restablece tu contraseña con este enlace (válido 1 hora): ${text("url")}`,
      };
    default:
      return { asunto: "Notificación", html: "<p>Notificación</p>", texto: "Notificación" };
  }
}
