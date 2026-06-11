import { SwRegister } from "@/components/sw-register";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:py-4">
            <Link href="/" className="text-lg font-bold text-marca sm:text-xl">
              🛍️ Tienda GaesSoft
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:gap-6">
              <Link href="/" className="hover:text-marca">
                Catálogo
              </Link>
              <Link href="/carrito" className="hover:text-marca">
                Carrito
              </Link>
              <Link href="/seguimiento" className="hover:text-marca">
                Rastrear
              </Link>
              <Link href="/cuenta" className="hover:text-marca">
                Mi cuenta
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mt-16 border-t bg-white py-6 text-center text-sm text-gray-500">
          Powered by GaesSoft POS
        </footer>
        <SwRegister />
      </body>
    </html>
  );
}
