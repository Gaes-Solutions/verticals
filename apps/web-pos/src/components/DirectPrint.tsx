import { useRef, useState } from "react";
import { api } from "../lib/api.js";
export function DirectPrint({ saleId }: { saleId: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem("gaes_print_token") ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const jobKey = `gaes_print_job:${saleId}`;
  async function print(newCopy = false) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem("gaes_print_token", token);
      const previous = newCopy ? null : sessionStorage.getItem(jobKey);
      const job = previous
        ? (JSON.parse(previous) as { id: string; ticket: unknown })
        : { id: crypto.randomUUID(), ticket: await api(`/t/ventas/${saleId}/ticket`) };
      sessionStorage.setItem(jobKey, JSON.stringify(job));
      const res = await fetch("http://127.0.0.1:9876/print/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": job.id,
        },
        body: JSON.stringify(job.ticket),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await res.json()) as { state?: string; message?: string };
      if (!res.ok) throw new Error(result.message ?? "No se confirmó la impresión");
      if (result.state !== "accepted") throw new Error("Respuesta de impresora no válida");
      setMessage("Enviado a la impresora. Comprueba que salió el ticket.");
    } catch (e) {
      setMessage(
        e instanceof Error && e.message !== "Failed to fetch"
          ? e.message
          : "Sin respuesta de la impresora. Revisa el papel y la conexión antes de pedir otra copia.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="w-full text-left">
      <button type="button" className="gx-btn-secondary" onClick={() => setOpen((v) => !v)}>
        Impresión directa ESC/POS
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded border p-3">
          <label className="gx-label">
            Clave del puente local
            <input
              className="gx-input"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <p className="text-sm">
            Configura el puente con el origen <code>{window.location.origin}</code>. La clave se
            conserva durante esta sesión.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="gx-btn-primary"
              disabled={busy || token.length < 32}
              onClick={() => void print()}
            >
              {busy ? "Enviando…" : "Enviar / consultar mismo ticket"}
            </button>
            <button
              type="button"
              className="gx-btn-secondary"
              disabled={busy || token.length < 32}
              onClick={() => {
                if (
                  window.confirm(
                    "Esto imprimirá otra copia. ¿Ya revisaste el papel y necesitas una copia adicional?",
                  )
                )
                  void print(true);
              }}
            >
              Imprimir otra copia
            </button>
          </div>
          {message && (
            <p aria-live="polite" className="text-sm">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
