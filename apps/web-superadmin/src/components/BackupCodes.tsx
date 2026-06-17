import { useState } from "react";

/** Muestra los códigos de respaldo (una sola vez) con copiar y descargar. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const [copiado, setCopiado] = useState(false);
  const texto = codes.join("\n");

  function copiar() {
    navigator.clipboard?.writeText(texto).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      },
      () => undefined,
    );
  }

  function descargar() {
    const blob = new Blob(
      [`Códigos de respaldo GaesSoft\nGuárdalos en un lugar seguro.\n\n${texto}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gaessoft-codigos-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2 className="mb-1 font-bold text-lg text-slate-800">Códigos de respaldo</h2>
      <p className="mb-3 text-slate-500 text-sm">
        Guárdalos en un lugar seguro. Cada uno sirve <strong>una sola vez</strong> para entrar si
        pierdes tu teléfono. <strong>No se volverán a mostrar.</strong>
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-4 font-mono text-slate-800 text-sm">
        {codes.map((c) => (
          <span key={c} className="text-center">
            {c}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copiar} className="gx-btn-secondary flex-1">
          {copiado ? "✓ Copiado" : "Copiar"}
        </button>
        <button type="button" onClick={descargar} className="gx-btn-secondary flex-1">
          Descargar .txt
        </button>
      </div>
    </div>
  );
}
