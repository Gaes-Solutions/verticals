import { FooterTienda } from "@/components/footer-tienda";
import { HeaderAcciones } from "@/components/header-acciones";
import { SwRegister } from "@/components/sw-register";
import { getTiendaConfig } from "@/lib/api";
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
  const config = await getTiendaConfig().catch(() => null);
  const nombre = config?.nombre ?? "Tienda";

  return (
    <html lang="es-MX">
      <body className="bg-gray-50 text-gray-900">
        <div className="bg-marca text-center text-white text-xs">
          <p className="py-1.5">
            🚚 Envíos a todo México · 🔒 Compra protegida · 💳 Meses sin intereses
          </p>
        </div>

        <header className="sticky top-0 z-40 border-b bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 font-bold text-lg text-marca sm:text-xl"
            >
              <span className="text-2xl">🛍️</span>
              <span className="hidden whitespace-nowrap sm:inline">{nombre}</span>
            </Link>
            <HeaderAcciones />
          </div>
        </header>

        <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-6 sm:py-8">{children}</main>

        <FooterTienda nombre={nombre} />
        <SwRegister />
      </body>
    </html>
  );
}
