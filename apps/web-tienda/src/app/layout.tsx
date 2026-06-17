import { FooterTienda } from "@/components/footer-tienda";
import { HeaderAcciones } from "@/components/header-acciones";
import { SwRegister } from "@/components/sw-register";
import { getCategorias, getTiendaConfig } from "@/lib/api";
import { CreditCard, Flame, ShieldCheck, Store, Truck } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tienda GaesSoft",
  description: "Tienda en línea impulsada por GaesSoft POS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tienda", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
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
      <body className="bg-gray-50 text-gray-900">
        <div className="bg-marca text-white text-xs">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2">
            <span className="flex items-center gap-1.5">
              <Truck size={14} strokeWidth={2} /> Envíos a todo México
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} strokeWidth={2} /> Compra protegida
            </span>
            <span className="flex items-center gap-1.5">
              <CreditCard size={14} strokeWidth={2} /> Meses sin intereses
            </span>
          </div>
        </div>

        <header className="sticky top-0 z-40 border-b bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg text-marca sm:text-xl"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-marca text-white">
                <Store size={20} strokeWidth={2} />
              </span>
              <span className="hidden whitespace-nowrap sm:inline">{nombre}</span>
            </Link>
            <HeaderAcciones />
          </div>
          {navCategorias.length > 0 && (
            <nav className="border-gray-100 border-t bg-white">
              <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Link
                  href="/?soloOfertas=true"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-3 py-1 font-semibold text-red-600 hover:bg-red-100"
                >
                  <Flame size={14} strokeWidth={2.25} /> Ofertas
                </Link>
                {navCategorias.map((c) => (
                  <Link
                    key={c.id}
                    href={`/?cat=${c.id}`}
                    className="shrink-0 rounded-full px-3 py-1 text-gray-600 hover:bg-gray-100"
                  >
                    {c.nombre}
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </header>

        <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-6 sm:py-8">{children}</main>

        <FooterTienda nombre={nombre} />
        <SwRegister />
      </body>
    </html>
  );
}
