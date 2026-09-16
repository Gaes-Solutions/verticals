import { useCallback, useEffect, useState } from "react";
import { api, loadToken, puede } from "../lib/api.js";
interface Asset {
  id: string;
  declaredMime: string;
  status: string;
  createdAt: string;
}
interface Publication {
  id: string;
  title: string;
  status: string;
  endsAt: string;
}
interface Branch {
  id: string;
  nombre: string;
}
const statuses: Record<string, string> = {
  ready: "Listo",
  uploading: "Esperando archivo",
  validating: "Inspeccionando",
  rejected: "Rechazado",
  expired: "Expirado",
};
export function KioskoMediaPanel() {
  const [data, setData] = useState<{ assets: Asset[]; publications: Publication[] }>({
    assets: [],
    publications: [],
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assetId, setAssetId] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = puede("configuracion.actualizar");
  const refresh = useCallback(async () => {
    const [media, list] = await Promise.all([
      api<typeof data>("/t/kioskos/media"),
      api<Branch[]>("/t/sucursales"),
    ]);
    setData(media);
    setBranches(list);
  }, []);
  useEffect(() => {
    void refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "No se pudieron cargar los anuncios"),
    );
  }, [refresh]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la operación");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    const max = file.type === "video/mp4" ? 50 : 8;
    if (
      !["video/mp4", "image/png", "image/jpeg"].includes(file.type) ||
      file.size > max * 1024 * 1024
    )
      throw new Error("Usa MP4 de hasta 50 MB o JPG/PNG de hasta 8 MB");
    const session = await api<{ id: string }>("/t/kioskos/media/uploads", {
      method: "POST",
      body: { requestKey: crypto.randomUUID(), declaredBytes: file.size, contentType: file.type },
    });
    const response = await fetch(`/api/t/kioskos/media/uploads/${session.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${loadToken()}`,
        "Content-Type": "application/octet-stream",
      },
      body: file,
      signal: AbortSignal.timeout(100_000),
    });
    const body = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !body.id)
      throw new Error(body.message ?? "Carga interrumpida; actualiza para consultar su estado");
    setAssetId(body.id);
    setTitle(file.name.replace(/\.[^.]+$/, ""));
  }
  return (
    <section className="gx-card space-y-4 p-5">
      <h2 className="font-semibold text-lg">Tus anuncios: imágenes y videos</h2>
      <p className="text-sm text-slate-600">
        MP4 H.264, hasta 60 segundos, 1080p y 30 fps; audio AAC opcional. Se reproducen sin sonido.
        JPG/PNG hasta 8 MB. El archivo se inspecciona antes de publicarlo.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {edit && (
        <label className="gx-label">
          Cargar archivo
          <input
            className="gx-input mt-1"
            type="file"
            accept="image/jpeg,image/png,video/mp4"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(() => upload(file));
              e.target.value = "";
            }}
          />
        </label>
      )}
      <button
        type="button"
        className="gx-btn-secondary"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        {busy ? "Procesando…" : "Actualizar estado"}
      </button>
      <ul className="space-y-2">
        {data.assets.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {a.declaredMime} · {new Date(a.createdAt).toLocaleString("es-MX")} ·{" "}
              {statuses[a.status] ?? a.status}
            </span>
            {edit && !["uploading", "validating"].includes(a.status) && (
              <button
                type="button"
                className="gx-btn-secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => api(`/t/kioskos/media/assets/${a.id}`, { method: "DELETE" }))
                }
              >
                Eliminar archivo
              </button>
            )}
          </li>
        ))}
      </ul>
      {edit && (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/t/kioskos/media/publications", {
                method: "POST",
                body: {
                  assetId,
                  title,
                  branchIds,
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                },
              });
              setTitle("");
            });
          }}
        >
          <label className="gx-label">
            Archivo listo
            <select
              className="gx-input"
              required
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {data.assets
                .filter((a) => a.status === "ready")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.declaredMime} · {new Date(a.createdAt).toLocaleString("es-MX")}
                  </option>
                ))}
            </select>
          </label>
          <label className="gx-label">
            Título
            <input
              className="gx-input"
              maxLength={120}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="gx-label">Sucursales</legend>
            {branches.map((b) => (
              <label className="mr-4 inline-flex gap-2" key={b.id}>
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={(e) =>
                    setBranchIds((ids) =>
                      e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id),
                    )
                  }
                />
                {b.nombre}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="gx-label">
              Desde
              <input
                className="gx-input"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="gx-label">
              Hasta
              <input
                className="gx-input"
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" className="gx-btn-primary" disabled={busy || !branchIds.length}>
            Publicar anuncio
          </button>
        </form>
      )}
      <ul className="space-y-3">
        {data.publications.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {p.title} ·{" "}
              {p.status === "withdrawn"
                ? "Retirado"
                : new Date(p.endsAt) <= new Date()
                  ? "Finalizado"
                  : "Publicado"}{" "}
              · hasta {new Date(p.endsAt).toLocaleString("es-MX")}
            </span>
            {edit && p.status === "published" && (
              <button
                type="button"
                className="gx-btn-secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => api(`/t/kioskos/media/publications/${p.id}`, { method: "DELETE" }))
                }
              >
                Retirar anuncio
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
