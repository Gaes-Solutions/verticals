import { PagarCobro } from "@/components/pagar-cobro";
import { api } from "@/lib/api";

interface CobroPublico {
  token: string;
  concepto: string;
  monto: string;
  status: string;
  clienteNombre: string | null;
}

export default async function CobroPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let cobro: CobroPublico | null = null;
  try {
    cobro = await api<CobroPublico>(`/cobros/publico/${encodeURIComponent(token)}`, {
      revalidate: 0,
    });
  } catch {
    cobro = null;
  }

  if (!cobro) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-bold text-2xl text-slate-800">Link no encontrado</h1>
        <p className="mt-2 text-slate-500">Verifica el enlace con el negocio.</p>
      </div>
    );
  }

  return (
    <PagarCobro
      token={cobro.token}
      concepto={cobro.concepto}
      monto={cobro.monto}
      status={cobro.status}
    />
  );
}
