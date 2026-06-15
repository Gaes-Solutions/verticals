import { DireccionesCuenta } from "@/components/direcciones-cuenta";
import { LogoutBoton } from "@/components/logout-boton";
import { NotificacionesCliente } from "@/components/notificaciones-cliente";
import { PerfilCuenta } from "@/components/perfil-cuenta";
import { PwaPush } from "@/components/pwa-push";
import { ResenasCuenta } from "@/components/resenas-cuenta";
import { WishlistCuenta } from "@/components/wishlist-cuenta";
import {
  type ClienteMe,
  type CompraResenable,
  type PedidoCliente,
  type WishlistItem,
  clienteApi,
  getClienteToken,
} from "@/lib/cliente";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CuentaPage() {
  if (!(await getClienteToken())) redirect("/cuenta/login");

  let me: ClienteMe;
  let pedidos: PedidoCliente[];
  let wishlist: WishlistItem[];
  let resenables: CompraResenable[];
  try {
    [me, pedidos, wishlist, resenables] = await Promise.all([
      clienteApi<ClienteMe>("/cliente-portal/me"),
      clienteApi<PedidoCliente[]>("/cliente-portal/pedidos"),
      clienteApi<WishlistItem[]>("/cliente-portal/wishlist"),
      clienteApi<CompraResenable[]>("/cliente-portal/resenables"),
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
        <div className="flex items-center gap-2">
          <NotificacionesCliente />
          <LogoutBoton />
        </div>
      </div>

      <div className="mb-6">
        <PwaPush />
      </div>

      <h2 className="mb-3 text-lg font-bold">Mi perfil</h2>
      <div className="mb-10">
        <PerfilCuenta
          me={{
            nombre: me.nombre,
            apellidos: me.apellidos ?? null,
            email: me.email ?? null,
            telefono: me.telefono ?? null,
          }}
        />
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
                  <td className="px-4 py-2">{p.statusLabel ?? p.statusPedido}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    ${Number(p.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/cuenta/pedidos/${p.folioPublico}`}
                      className="text-marca hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10">
        <DireccionesCuenta />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-bold">Califica tus compras</h2>
      <ResenasCuenta inicial={resenables} />

      <h2 className="mt-10 mb-4 text-lg font-bold">Mi lista de deseos</h2>
      <WishlistCuenta inicial={wishlist} />
    </div>
  );
}
