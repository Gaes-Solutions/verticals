import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "../components/service-worker-register";

export const metadata: Metadata = {
  title: "GaesSoft POS",
  description: "Punto de venta móvil con escáner y operación offline.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "#f8fafc",
        }}
      >
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
