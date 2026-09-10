/**
 * Icono de la tienda a partir de su nombre. Mientras no exista carga de logo,
 * unas iniciales sobre un color propio ya distinguen una tienda de otra en la
 * pantalla del teléfono, que es lo que importa. Es el mismo recurso que usan
 * Gmail o Slack cuando no hay foto.
 */

/** Hasta dos iniciales: "Abarrotes Lupita" → "AL", "Ferretería" → "FE". */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !/^(de|del|la|el|los|las|y|e)$/i.test(p));
  if (palabras.length === 0) return "T";
  if (palabras.length === 1) return (palabras[0] as string).slice(0, 2).toUpperCase();
  return `${(palabras[0] as string)[0]}${(palabras[1] as string)[0]}`.toUpperCase();
}

/**
 * Color estable derivado del nombre: la misma tienda siempre tiene el mismo,
 * y dos tiendas distintas rara vez coinciden. Se fija saturación y luminosidad
 * para que el texto blanco encima siempre contraste.
 */
export function colorDeMarca(nombre: string): string {
  let acumulado = 0;
  for (const letra of nombre) acumulado = (acumulado * 31 + letra.charCodeAt(0)) % 360;
  return `hsl(${acumulado} 58% 34%)`;
}

export function svgIcono(nombre: string, recortable: boolean): string {
  const letras = iniciales(nombre);
  const fondo = colorDeMarca(nombre);
  // El icono recortable necesita margen: Android le corta las esquinas según
  // la forma que use el lanzador.
  const escala = recortable ? 0.56 : 0.72;
  const radio = recortable ? 256 : 108;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapar(nombre)}">
  <rect width="512" height="512" rx="${radio}" fill="${fondo}"/>
  <text x="256" y="256" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    font-size="${Math.round(512 * escala * 0.62)}" font-weight="700" letter-spacing="-8"
    text-anchor="middle" dominant-baseline="central">${escapar(letras)}</text>
</svg>`;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
