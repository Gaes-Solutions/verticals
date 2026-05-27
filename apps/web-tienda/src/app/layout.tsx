import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tienda GaesSoft",
  description: "Tienda en línea impulsada por GaesSoft POS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-xl font-bold text-marca">
              🛍️ Tienda GaesSoft
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link href="/" className="hover:text-marca">
                Catálogo
              </Link>
              <Link href="/carrito" className="hover:text-marca">
                Carrito
              </Link>
              <Link href="/seguimiento" className="hover:text-marca">
                Rastrear pedido
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t bg-white py-6 text-center text-sm text-gray-500">
          Powered by GaesSoft POS
        </footer>
      </body>
    </html>
  );
}
