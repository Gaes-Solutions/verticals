import { CustomerPasskeys } from "@/components/customer-passkeys";
import { DireccionesCuenta } from "@/components/direcciones-cuenta";
import { EstadoError } from "@/components/estado-error";
import { LogoutBoton } from "@/components/logout-boton";
import { MediosPagoCuenta } from "@/components/medios-pago-cuenta";
import { NotificacionesCliente } from "@/components/notificaciones-cliente";
import { PerfilCuenta } from "@/components/perfil-cuenta";
import { PwaPush } from "@/components/pwa-push";
import { ResenasCuenta } from "@/components/resenas-cuenta";
import { WishlistCuenta } from "@/components/wishlist-cuenta";
import {
  ClienteApiError,
  type ClienteMe,
  type CompraResenable,
  type PedidoCliente,
  type WishlistItem,
  clienteApi,
  getClienteToken,
} from "@/lib/cliente";
import { ArrowRight, Heart, MapPin, Package, UserRound } from "lucide-react";
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
  } catch (err) {
    // Solo una sesión inválida expulsa a login; un 500 del servidor no.
    if (err instanceof ClienteApiError && err.statusCode === 401) {
      redirect("/cuenta/login");
    }
    return (
      <EstadoError
        titulo="No se pudo cargar tu cuenta"
        descripcion="Tuvimos un problema al consultar tu información. Inténtalo de nuevo en un momento."
      />
    );
  }

  return (
    <div>
      <div className="store-account-welcome relative mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto sm:flex-1">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-marca text-2xl font-bold text-white shadow-sm"
          >
            {(me.nombre?.trim()[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="store-kicker">TU ESPACIO PERSONAL</p>
            <h1 className="text-2xl font-bold">Hola, {me.nombre}</h1>
            <p className="break-all text-sm text-slate-500">{me.email}</p>
            <p className="mt-2 text-xs text-slate-500">
              {pedidos.length} pedidos · {wishlist.length} favoritos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificacionesCliente key={me.id} />
          <LogoutBoton />
        </div>
      </div>

      <nav className="store-account-nav" aria-label="Secciones de mi cuenta">
        {[
          { href: "#pedidos", icon: Package, title: "Mis pedidos", text: "Consulta tus compras" },
          {
            href: "#direcciones",
            icon: MapPin,
            title: "Mis direcciones",
            text: "Prepara tu próxima entrega",
          },
          { href: "#perfil", icon: UserRound, title: "Mi perfil", text: "Actualiza tus datos" },
          {
            href: "#favoritos",
            icon: Heart,
            title: "Mis favoritos",
            text: "Lo que te gusta, a mano",
          },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href}>
            <Icon size={24} strokeWidth={1.5} />
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <ArrowRight size={17} />
          </Link>
        ))}
      </nav>
      <div className="mb-6">
        <PwaPush />
      </div>

      <h2 id="perfil" className="mb-3 scroll-mt-44 text-lg font-bold">
        Mi perfil
      </h2>
      <div className="mb-10">
        <PerfilCuenta
          key={me.id}
          me={{
            nombre: me.nombre,
            apellidos: me.apellidos ?? null,
            email: me.email ?? null,
            telefono: me.telefono ?? null,
          }}
        />
      </div>

      <CustomerPasskeys key={me.id} />

      <h2 id="pedidos" className="mb-4 scroll-mt-44 text-lg font-bold">
        Mis pedidos
      </h2>
      {pedidos.length === 0 ? (
        <div className="gx-card p-8 text-center">
          <p className="text-slate-500">Aún no tienes pedidos.</p>
          <Link href="/" className="mt-2 inline-block font-medium text-marca">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/cuenta/pedidos/${p.folioPublico}`}
                className="gx-card flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">Pedido {p.folioPublico}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(p.createdAt).toLocaleDateString("es-MX")}
                  </p>
                  <p className="mt-2 text-sm text-marca">{p.statusLabel ?? p.statusPedido}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold">${Number(p.total).toFixed(2)}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs text-marca">
                    Ver detalle <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="gx-table-wrap hidden sm:block">
            <table className="gx-table">
              <thead>
                <tr>
                  <th className="gx-th">Pedido</th>
                  <th className="gx-th">Fecha</th>
                  <th className="gx-th">Estado</th>
                  <th className="gx-th text-right">Total</th>
                  <th className="gx-th" />
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td className="gx-td font-medium">{p.folioPublico}</td>
                    <td className="gx-td text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString("es-MX")}
                    </td>
                    <td className="gx-td">{p.statusLabel ?? p.statusPedido}</td>
                    <td className="gx-td text-right font-semibold">
                      ${Number(p.total).toFixed(2)}
                    </td>
                    <td className="gx-td text-right">
                      <Link
                        href={`/cuenta/pedidos/${p.folioPublico}`}
                        className="font-medium text-marca hover:underline"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div id="direcciones" className="mt-10 scroll-mt-44">
        <DireccionesCuenta key={me.id} />
      </div>

      <div className="mt-10">
        <MediosPagoCuenta key={me.id} />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-bold">Califica tus compras</h2>
      <ResenasCuenta key={me.id} inicial={resenables} />

      <h2 id="favoritos" className="mt-10 mb-4 scroll-mt-44 text-lg font-bold">
        Mi lista de deseos
      </h2>
      <WishlistCuenta key={me.id} inicial={wishlist} />
    </div>
  );
}
