/**
 * Tienda fija de esta compilación. Cuando un negocio quiere SU app, se compila
 * con su slug y la app abre directo en su catálogo, sin preguntar nada.
 *
 * Se lee de `process.env` y no de `config.ts` a propósito: ese módulo arrastra
 * `expo-constants`, que no existe fuera del teléfono y rompería a cualquier
 * prueba que solo quiera saber en qué tienda estamos.
 */
const TIENDA_FIJA = process.env.EXPO_PUBLIC_TIENDA ?? null;
const TIENDA_KEY = "gaessoft_cliente_tienda";

/**
 * En qué tienda está parado el comprador, y si ya entró con su cuenta.
 *
 * A propósito NO conoce al almacén de sesión: es el almacén el que le avisa
 * cuando entra o sale. Al revés, cualquier servicio que preguntara por la
 * tienda arrastraría toda la autenticación detrás.
 *
 * La tienda se resuelve así:
 * 1. La sesión, si ya entró: manda por encima de todo.
 * 2. La tienda fija de la compilación, para las apps de marca propia.
 * 3. La última que eligió y quedó guardada.
 *
 * Nunca se le pregunta de entrada: nadie sabe el nombre corto de una tienda, y
 * preguntarlo era lo primero que veía al abrir la app.
 */
let elegida: string | null = null;
let sesion: string | null = null;

// El almacenamiento seguro vive en un módulo nativo: se carga solo cuando de
// verdad hace falta, para que saber en qué tienda estamos no dependa de él.
const almacen = async () => (await import("./storage")).secureStorage;

export async function cargarTiendaGuardada(): Promise<void> {
  if (TIENDA_FIJA) return;
  elegida = await (await almacen()).get(TIENDA_KEY);
}

export async function fijarTienda(slug: string): Promise<void> {
  elegida = slug;
  await (await almacen()).set(TIENDA_KEY, slug);
}

/** El almacén de sesión avisa aquí al entrar (con su tienda) y al salir (null). */
export function marcarSesion(tenantSlug: string | null): void {
  sesion = tenantSlug;
}

export function tiendaActual(): string | null {
  return sesion ?? TIENDA_FIJA ?? elegida;
}

export function haySesion(): boolean {
  return sesion !== null;
}
