/**
 * Deja el tenant de pruebas con catálogo y existencias antes de correr los
 * happy paths. Habla con la API por HTTP, igual que lo haría el panel, para no
 * depender de la capa de Prisma desde Playwright.
 *
 * El tenant se crea una sola vez, a mano:
 *   pnpm --filter @gaespos/db migrate tenant onboard e2e-retail \
 *     -n "E2E Retail" -e dueno@e2e.local -P "E2ePruebas!2026"
 */
const API = process.env.E2E_API ?? "http://127.0.0.1:3000";

export const CUENTA = {
  tenant: "e2e-retail",
  email: "dueno@e2e.local",
  password: "E2ePruebas!2026",
};

export const PROMO = "20% en azúcar (e2e)";

export const CATALOGO = [
  { sku: "E2E-CAFE", nombre: "Café molido 500g", precio: "128.00", codigo: "7500000000018" },
  { sku: "E2E-AZUCAR", nombre: "Azúcar estándar 1kg", precio: "36.50", codigo: "7500000000025" },
];

async function api<T>(ruta: string, opciones: RequestInit = {}, token?: string): Promise<T> {
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opciones.headers ?? {}),
    },
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${ruta} → ${respuesta.status} ${texto.slice(0, 300)}`);
  return texto ? (JSON.parse(texto) as T) : (null as T);
}

export async function entrar(): Promise<string> {
  const sesion = await api<{ accessToken?: string; mfaRequired?: boolean }>("/auth/tenant/login", {
    method: "POST",
    body: JSON.stringify({
      tenantSlug: CUENTA.tenant,
      email: CUENTA.email,
      password: CUENTA.password,
    }),
  });
  if (!sesion.accessToken)
    throw new Error("El dueño de pruebas quedó con 2FA activo; desactívalo o recrea el tenant.");
  return sesion.accessToken;
}

export default async function siembra() {
  const token = await entrar();

  await api(
    "/t/productos/bulk",
    {
      method: "POST",
      body: JSON.stringify({
        filas: CATALOGO.map((p) => ({
          skuPadre: p.sku,
          nombre: p.nombre,
          precioBase: p.precio,
          codigoBarras: p.codigo,
          claveSat: "50181900",
          claveUnidadSat: "H87",
        })),
      }),
    },
    token,
  );

  const sucursales = await api<Array<{ id: string }>>("/t/sucursales", {}, token);
  const sucursalId = sucursales[0]?.id;
  if (!sucursalId) throw new Error("El tenant de pruebas no tiene sucursal");

  // Promoción del 20% sobre el azúcar: el punto de venta debe aplicarla sola,
  // sin que el cajero haga nada. Es lo que el checklist llama "promoción activa
  // aplica en venta".
  const azucar = await api<{ id: string; variantes: Array<{ id: string }> }>(
    `/t/productos/buscar/${CATALOGO[1]?.codigo}`,
    {},
    token,
  );
  // El listado devuelve un arreglo plano, no paginado.
  const promos = await api<Array<{ id: string; nombre: string; status: string }>>(
    "/t/promociones",
    {},
    token,
  ).catch(() => []);
  // Buscar o crear, y SIEMPRE dejarla activa: una promoción en borrador no
  // aplica, y una corrida anterior pudo dejarla a medias.
  const existente = promos.find((p) => p.nombre === PROMO);
  const promoId =
    existente?.id ??
    (
      await api<{ id: string }>(
        "/t/promociones",
        {
          method: "POST",
          body: JSON.stringify({
            nombre: PROMO,
            tipo: "descuento_pct",
            acciones: { valor: 20 },
            vigenciaInicio: new Date(Date.now() - 86_400_000).toISOString(),
            canales: ["todos"],
            productos: [{ productoId: azucar.id, rol: "incluido" }],
          }),
        },
        token,
      )
    ).id;
  if (existente?.status !== "activa") {
    await api(`/t/promociones/${promoId}/activar`, { method: "POST", body: "{}" }, token);
  }

  // Existencias altas: que ninguna prueba falle por inventario agotado de
  // corridas anteriores.
  for (const producto of CATALOGO) {
    const encontrado = await api<{ variantes: Array<{ id: string }> }>(
      `/t/productos/buscar/${producto.codigo}`,
      {},
      token,
    );
    const varianteId = encontrado.variantes[0]?.id;
    if (!varianteId) throw new Error(`Sin variante para ${producto.sku}`);
    await api(
      "/t/inventario/ajustes",
      {
        method: "POST",
        body: JSON.stringify({
          varianteId,
          sucursalId,
          tipo: "ajuste_positivo",
          cantidad: "500",
          motivo: "Siembra e2e",
        }),
      },
      token,
    );
  }
}
