import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Recuperar carrito",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RecoveryLayout({ children }: { children: ReactNode }) {
  return children;
}
