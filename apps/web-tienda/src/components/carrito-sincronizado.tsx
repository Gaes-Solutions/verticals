"use client";
import {
  type CarritoLineaLocal,
  configurarCarrito,
  fijarCarritoVersion,
  guardarCarrito,
  leerCarrito,
  leerLineasGuardadas,
  recibirCarrito,
} from "@/lib/carrito-store";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
interface Cart {
  version: string;
  cuponCodigo: string | null;
  items: { varianteId: string; cantidad: string; nombre: string; precioUnitario: string }[];
}
export function CarritoSincronizado({ owner }: { owner: string | null }) {
  const path = usePathname();
  const [message, setMessage] = useState("");
  const refreshRef = useRef<() => void>(() => {});
  const pathRef = useRef(path);
  pathRef.current = path;
  const [local, setLocal] = useState<CarritoLineaLocal[]>([]);
  useEffect(() => {
    let alive = true;
    let busy = false;
    let ready = false;
    let dirty = false;
    let revision = 0;
    let version: string | null = null;
    let coupon: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pendingKey = `gaespos_carrito_pendiente:${owner}`;
    const old = localStorage.getItem(pendingKey) ?? localStorage.getItem("gaespos_carrito");
    setLocal(owner ? leerLineasGuardadas(old) : []);
    fijarCarritoVersion(null);
    setMessage(owner ? "Sincronizando carrito…" : "");
    function apply(cart: Cart | null) {
      const previous = new Map(leerCarrito().map((item) => [item.varianteId, item]));
      version = cart?.version ?? null;
      fijarCarritoVersion(version);
      coupon = cart?.cuponCodigo ?? null;
      recibirCarrito(
        cart?.items.map((item) => ({
          ...previous.get(item.varianteId),
          varianteId: item.varianteId,
          cantidad: Number(item.cantidad),
          titulo: item.nombre,
          precio: item.precioUnitario,
        })) ?? [],
      );
    }
    async function request(body?: unknown) {
      const res = await fetch("/api/cuenta/carrito", {
        method: body ? "POST" : "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(16000),
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      const data = await res.json();
      if (!alive) return null;
      if (!res.ok)
        throw Object.assign(new Error(data.message ?? "No pudimos sincronizar tu carrito."), {
          code: data.code,
        });
      if (data.owner !== owner) throw new Error("La cuenta cambió. Vuelve a cargar la página.");
      return data as { owner: string; cart: Cart | null };
    }
    async function sync() {
      if (!owner || !alive || busy || document.visibilityState === "hidden") return;
      // A pending checkout owns its cart; its outcome must be resolved first.
      if (pathRef.current.startsWith("/checkout") && ready && !dirty) return;
      busy = true;
      const start = revision;
      try {
        if (!ready || !dirty) {
          const result = await request();
          if (!result || !alive) return;
          if (revision !== start) {
            // Keep local work available to import, never silently overwrite the account.
            setLocal(leerCarrito());
            dirty = false;
            setMessage("El carrito se actualizó. Puedes agregar tu selección anterior abajo.");
          } else setMessage("");
          apply(result.cart);
          ready = true;
        } else {
          const result = await request({
            owner,
            expectedVersion: version,
            items: leerCarrito().map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
            ...(coupon ? { cuponCodigo: coupon } : {}),
          });
          if (!result || !alive) return;
          version = result.cart?.version ?? null;
          fijarCarritoVersion(version);
          if (revision === start) {
            dirty = false;
            apply(result.cart);
            localStorage.removeItem(pendingKey);
            setMessage("");
          }
        }
      } catch (error) {
        if (!alive) return;
        if ((error as { code?: string }).code === "CART_CHANGED") {
          setLocal(leerCarrito());
          dirty = false;
          ready = false;
        }
        setMessage(error instanceof Error ? error.message : "No pudimos sincronizar tu carrito.");
      } finally {
        busy = false;
        if (alive && dirty && ready && revision !== start)
          timer = setTimeout(() => void sync(), 600);
      }
    }
    configurarCarrito(
      owner,
      owner
        ? () => {
            dirty = true;
            revision++;
            localStorage.setItem(pendingKey, JSON.stringify(leerCarrito()));
            setMessage("Guardando carrito…");
            clearTimeout(timer);
            timer = setTimeout(() => void sync(), 600);
          }
        : null,
    );
    refreshRef.current = () => void sync();
    void sync();
    const refresh = () => {
      if (!dirty) void sync();
    };
    const poll = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const completed = () => {
      dirty = false;
      ready = false;
      version = null;
      fijarCarritoVersion(null);
      localStorage.removeItem(pendingKey);
      void sync();
    };
    window.addEventListener("carrito-finalizado", completed);
    const changed = (event: StorageEvent) => {
      if (event.key?.startsWith("gaespos_carrito")) refresh();
    };
    window.addEventListener("storage", changed);
    return () => {
      alive = false;
      clearInterval(poll);
      clearTimeout(timer);
      configurarCarrito(null, null);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", changed);
      window.removeEventListener("carrito-finalizado", completed);
    };
  }, [owner]);
  useEffect(() => {
    pathRef.current = path;
    refreshRef.current();
  }, [path]);
  if (!owner) return null;
  return (
    <div className="tienda-shell" aria-live="polite">
      {message && (
        <p className="my-2 text-sm text-slate-600">
          {message}{" "}
          <button type="button" className="underline" onClick={() => refreshRef.current()}>
            Actualizar
          </button>
        </p>
      )}
      {local.length > 0 && (
        <div className="my-2 rounded-xl border bg-white p-3 text-sm">
          Tienes {local.length} artículos guardados en este navegador.{" "}
          <button
            type="button"
            className="font-semibold text-marca underline"
            onClick={() => {
              const merged = new Map(leerCarrito().map((item) => [item.varianteId, item]));
              for (const item of local) {
                const current = merged.get(item.varianteId);
                merged.set(item.varianteId, {
                  ...item,
                  cantidad: Math.max(item.cantidad, current?.cantidad ?? 0),
                });
              }
              guardarCarrito([...merged.values()]);
              localStorage.removeItem("gaespos_carrito");
              setLocal([]);
            }}
          >
            Agregar a este carrito
          </button>
        </div>
      )}
    </div>
  );
}
