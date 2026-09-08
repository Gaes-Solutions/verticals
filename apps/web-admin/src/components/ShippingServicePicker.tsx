import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface ShippingService {
  id: string;
  nombre: string;
  nombreVariante: string | null;
  sku: string;
}

function label(service: ShippingService) {
  return `${service.nombre}${service.nombreVariante ? ` · ${service.nombreVariante}` : ""} (${service.sku})`;
}

export function ShippingServicePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ShippingService[]>([]);
  const [selected, setSelected] = useState<ShippingService | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const result = await api<ShippingService[]>(
          `/t/ecommerce/servicios-envio?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (active) setItems(result);
      } catch {
        if (active) {
          setItems([]);
          setError("No se pudieron consultar los servicios. La selección guardada se conserva.");
        }
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry]);

  useEffect(() => {
    setSelected(null);
    setSelectionError(null);
    if (!value) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    api<ShippingService>(`/t/ecommerce/servicios-envio/${encodeURIComponent(value)}`, {
      signal: controller.signal,
    })
      .then((item) => {
        if (active) setSelected(item);
      })
      .catch(() => {
        if (active)
          setSelectionError(
            "No se pudo verificar el servicio seleccionado. Revísalo antes de guardar.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [value, retry]);

  return (
    <div className="gx-card mb-4 min-w-0">
      <h3 className="mb-2 font-semibold text-slate-800">Concepto de envío en la venta</h3>
      <p className="mb-3 text-sm text-slate-600">
        Selecciona un producto de tipo servicio con los impuestos y datos del negocio. Se usará para
        registrar el importe de envío cobrado al cliente.
      </p>
      <label className="gx-label" htmlFor="shipping-service-search">
        Buscar servicio por nombre o SKU
      </label>
      <input
        id="shipping-service-search"
        className="gx-input mb-3 w-full"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={120}
        disabled={disabled}
      />
      <label className="gx-label" htmlFor="shipping-service">
        Servicio para registrar el envío
      </label>
      <select
        id="shipping-service"
        className="gx-input w-full min-w-0"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled || loading || Boolean(error)}
      >
        <option value="">Sin configurar</option>
        {value && !items.some((item) => item.id === value) && (
          <option value={value}>
            {selected ? label(selected) : "Servicio seleccionado · pendiente de verificar"}
          </option>
        )}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {label(item)}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-2 break-words text-sm text-slate-600">Seleccionado: {label(selected)}</p>
      )}
      {selectionError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {selectionError}
        </p>
      )}
      {loading && (
        <output className="mt-2 block text-sm text-slate-500">Consultando servicios…</output>
      )}
      {error && (
        <div role="alert" className="mt-3 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            className="gx-btn-secondary mt-2"
            disabled={disabled}
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar búsqueda
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          No hay servicios disponibles para esta búsqueda. Crea o activa el concepto en Productos.
        </p>
      )}
      {!value && (
        <p className="mt-3 text-sm text-warn">
          Los pedidos con envío de pago no podrán cobrarse hasta configurar este concepto. El envío
          gratuito no lo necesita.
        </p>
      )}
    </div>
  );
}
