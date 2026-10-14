"use client";

import { borrarBorradorCompra } from "@/lib/checkout-draft";
import { useRouter } from "next/navigation";

export function LogoutBoton() {
  const router = useRouter();
  async function salir() {
    await fetch("/api/cuenta/logout", { method: "POST" });
    borrarBorradorCompra();
    router.push("/");
    router.refresh();
  }
  return (
    <button type="button" onClick={salir} className="gx-btn-ghost">
      Cerrar sesión
    </button>
  );
}
