import { CarritoFlotante } from "@/components/carrito-flotante";
import { CarritoSincronizado } from "@/components/carrito-sincronizado";
import { FooterTienda } from "@/components/footer-tienda";
import { HeaderAcciones } from "@/components/header-acciones";
import { SwRegister } from "@/components/sw-register";
import { getCategorias, getTiendaConfig } from "@/lib/api";
import { getClienteSession } from "@/lib/cliente";
import { Flame, Store } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";

/**
 * El título, el icono y el manifiesto salen del negocio, no de la plataforma:
 * el comprador entró a SU tienda, y así es como la ve en la pestaña, en el
 * historial y cuando la agrega a su pantalla de inicio.
 */
export async function generateMetadata(): Promise<Metadata> {
  const config = await getTiendaConfig().catch(() => null);
  const nombre = config?.nombre?.trim() || "Tienda";
  return {
    title: { default: nombre, template: `%s · ${nombre}` },
    description: config?.lema?.trim() || `Compra en línea en ${nombre}`,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icono.svg", apple: "/icono.svg" },
    appleWebApp: { capable: true, title: nombre, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [config, categorias] = await Promise.all([
    getTiendaConfig().catch(() => null),
    getCategorias().catch(() => []),
  ]);
  const session = await getClienteSession().catch(() => null);
  const cartOwner = session
    ? JSON.stringify([session.cliente.tenantSlug, session.cliente.id])
    : null;
  const nombre = config?.nombre ?? "Tienda";
  const navCategorias = categorias.slice(0, 8);

  return (
    <html lang="es-MX">
      <body className="bg-slate-50 text-slate-900">
        <div className="store-announcement">
          <div className="tienda-shell">
            {config?.recogidaEnTienda
              ? "Compra en línea y recoge en tienda"
              : "Descubre tus próximos favoritos"}
            <Link href="/seguimiento">Sigue tu pedido →</Link>
          </div>
        </div>
        <header className="store-header">
          <div className="tienda-shell store-header-main">
            <Link href="/" className="store-logo" aria-label={`${nombre}, inicio`}>
              <span>
                <Store size={25} />
              </span>
              <div>
                {nombre}
                <small>Tu tienda en línea</small>
              </div>
            </Link>
            <Suspense fallback={<div className="h-12 flex-1" aria-hidden="true" />}>
              <HeaderAcciones />
            </Suspense>
          </div>
          <nav aria-label="Departamentos" className="store-departments">
            <div className="tienda-shell">
              <Link href="/#catalogo" className="font-semibold">
                Todos los productos
              </Link>
              <Link href="/?soloOfertas=true" className="store-offers">
                <Flame size={16} /> Ofertas
              </Link>
              {navCategorias.map((c) => (
                <Link key={c.id} href={`/?cat=${c.id}`}>
                  {c.nombre}
                </Link>
              ))}
              <Link href="/?orden=novedad">Novedades</Link>
            </div>
          </nav>
        </header>

        <CarritoSincronizado owner={cartOwner} />
        <main className="tienda-shell min-h-[60vh] py-6 sm:py-10">{children}</main>

        <FooterTienda nombre={nombre} metodosPago={config?.metodosPago} />
        <CarritoFlotante />
        <SwRegister />
      </body>
    </html>
  );
}
