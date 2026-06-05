import { LogoutBoton } from "@/components/logout-boton";
import { WishlistCuenta } from "@/components/wishlist-cuenta";
import {
  type ClienteMe,
  type PedidoCliente,
  type WishlistItem,
  clienteApi,
  getClienteToken,
} from "@/lib/cliente";
import Link from "next/link";
import { redirect } from "next/navigation";

const STATUS_LABEL: Record<string, string> = {
  recibido: "Recibido",
  pago_confirmado: "Pago confirmado",
  preparando: "Preparando",
  enviado: "Enviado",
  en_camino: "En camino",
  entregado: "Entregado",
  recogido: "Recogido",
  cancelado: "Cancelado",
};

export default async function CuentaPage() {
  if (!(await getClienteToken())) redirect("/cuenta/login");

  let me: ClienteMe;
  let pedidos: PedidoCliente[];
  let wishlist: WishlistItem[];
  try {
    [me, pedidos, wishlist] = await Promise.all([
      clienteApi<ClienteMe>("/cliente-portal/me"),
      clienteApi<PedidoCliente[]>("/cliente-portal/pedidos"),
      clienteApi<WishlistItem[]>("/cliente-portal/wishlist"),
    ]);
  } catch {
    // token expirado o inválido → re-login
    redirect("/cuenta/login");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hola, {me.nombre}</h1>
          <p className="text-sm text-gray-500">{me.email}</p>
        </div>
        <LogoutBoton />
      </div>

      <h2 className="mb-4 text-lg font-bold">Mis pedidos</h2>
      {pedidos.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
          <p>Aún no tienes pedidos.</p>
          <Link href="/" className="mt-2 inline-block font-medium text-marca">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.folioPublico}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-4 py-2">{STATUS_LABEL[p.statusPedido] ?? p.statusPedido}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    ${Number(p.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/seguimiento?folio=${p.folioPublico}`}
                      className="text-marca hover:underline"
                    >
                      Seguir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 mb-4 text-lg font-bold">Mi lista de deseos</h2>
      <WishlistCuenta inicial={wishlist} />
    </div>
  );
}
