"use client";

import { useRouter } from "next/navigation";

export function LogoutBoton() {
  const router = useRouter();
  async function salir() {
    await fetch("/api/cuenta/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <button type="button" onClick={salir} className="text-sm text-gray-500 hover:text-marca">
      Cerrar sesión
    </button>
  );
}
