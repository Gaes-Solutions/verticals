import { FooterTienda } from "@/components/footer-tienda";
import { HeaderAcciones } from "@/components/header-acciones";
import { SwRegister } from "@/components/sw-register";
import { getCategorias, getTiendaConfig } from "@/lib/api";
import { CreditCard, Flame, ShieldCheck, Store, Truck } from "lucide-react";
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
  const nombre = config?.nombre ?? "Tienda";
  const navCategorias = categorias.slice(0, 8);

  return (
    <html lang="es-MX">
      <body className="bg-slate-50 text-slate-900">
        <div className="bg-gradient-to-r from-brand-dark via-marca to-brand-dark text-white text-xs">
          <div className="tienda-shell flex min-h-8 flex-wrap items-center justify-center gap-x-5 gap-y-1 py-2">
            {config?.etaEnvio && (
              <span className="flex items-center gap-1.5">
                <Truck size={14} strokeWidth={2} /> Envío a todo México
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} strokeWidth={2} /> Compra protegida
            </span>
            {config?.msiHabilitado && config.msiMeses.length > 0 && (
              <span className="flex items-center gap-1.5">
                <CreditCard size={14} strokeWidth={2} /> Meses sin intereses
              </span>
            )}
          </div>
        </div>

        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-[0_4px_20px_rgb(15_23_42/0.06)] backdrop-blur-xl">
          <div className="tienda-shell flex items-center gap-3 py-3 sm:gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg text-marca sm:text-xl"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-marca to-brand-dark text-white shadow-md shadow-marca/20">
                <Store size={20} strokeWidth={2} />
              </span>
              <span className="hidden whitespace-nowrap sm:inline">{nombre}</span>
            </Link>
            <Suspense fallback={<div className="h-10 flex-1" aria-hidden="true" />}>
              <HeaderAcciones />
            </Suspense>
          </div>
          {navCategorias.length > 0 && (
            <nav className="border-slate-100 border-t bg-white">
              <div className="tienda-shell flex items-center gap-1 overflow-x-auto py-2 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Link
                  href="/?soloOfertas=true"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-danger-light px-3 py-1 font-semibold text-danger hover:bg-danger-light/70"
                >
                  <Flame size={14} strokeWidth={2.25} /> Ofertas
                </Link>
                {navCategorias.map((c) => (
                  <Link
                    key={c.id}
                    href={`/?cat=${c.id}`}
                    className="shrink-0 rounded-full px-3 py-1 text-slate-600 hover:bg-slate-100"
                  >
                    {c.nombre}
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </header>

        <main className="tienda-shell min-h-[60vh] py-6 sm:py-10">{children}</main>

        <FooterTienda nombre={nombre} />
        <SwRegister />
      </body>
    </html>
  );
}
