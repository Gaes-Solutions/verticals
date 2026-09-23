import { RestablecerContrasenaForm } from "@/components/restablecer-contrasena-form";
import { Suspense } from "react";

export default function RestablecerPage() {
  return (
    <Suspense fallback={<p className="text-center text-slate-500">Cargando…</p>}>
      <RestablecerContrasenaForm />
    </Suspense>
  );
}
