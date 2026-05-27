"use client";

import { type CarritoLineaLocal, leerCarrito, sessionId, vaciar } from "@/lib/carrito-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState("");
  const [cp, setCp] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(leerCarrito()), []);
  const total = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIdAnonimo: sessionId(),
          emailComprador: email,
          items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
          direccionEnvio: { nombre, calle: "—", ciudad, estado, cp },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Error en el pago");
      vaciar();
      router.push(
        `/seguimiento?folio=${data.folioPublico}&email=${encodeURIComponent(email)}&ok=1`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setProcesando(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-center text-gray-500">Tu carrito está vacío.</p>;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Finalizar compra</h1>
      <form onSubmit={pagar} className="space-y-4 rounded-lg border bg-white p-6">
        <Campo label="Email" value={email} onChange={setEmail} type="email" required />
        <Campo label="Nombre completo" value={nombre} onChange={setNombre} required />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Ciudad" value={ciudad} onChange={setCiudad} required />
          <Campo label="Estado" value={estado} onChange={setEstado} required />
        </div>
        <Campo label="Código postal" value={cp} onChange={setCp} required />
        <div className="border-t pt-4">
          <div className="mb-4 flex justify-between text-lg font-bold">
            <span>Total a pagar</span>
            <span className="text-marca">${total.toFixed(2)}</span>
          </div>
          {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={procesando}
            className="w-full rounded bg-marca py-3 font-medium text-white hover:bg-marca-dark disabled:opacity-50"
          >
            {procesando ? "Procesando pago…" : `Pagar $${total.toFixed(2)} (demo)`}
          </button>
          <p className="mt-2 text-center text-xs text-gray-400">
            Pago simulado con proveedor mock (sin cobro real)
          </p>
        </div>
      </form>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
    </label>
  );
}
