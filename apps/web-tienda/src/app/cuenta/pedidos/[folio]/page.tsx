import { ChatPedidoCliente } from "@/components/chat-pedido-cliente";
import { SolicitarDevolucion } from "@/components/solicitar-devolucion";
import { type PedidoDetalleCliente, clienteApi, getClienteToken } from "@/lib/cliente";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

interface SolicitudDevolucion {
  estado: string;
  rechazoMotivo: string | null;
  pedido: { folioPublico: string };
}

export default async function PedidoDetallePage({
  params,
}: {
  params: Promise<{ folio: string }>;
}) {
  if (!(await getClienteToken())) redirect("/cuenta/login");
  const { folio } = await params;

  let pedido: PedidoDetalleCliente;
  try {
    pedido = await clienteApi<PedidoDetalleCliente>(
      `/cliente-portal/pedidos/${encodeURIComponent(folio)}`,
    );
  } catch {
    notFound();
  }

  const solicitudes = await clienteApi<SolicitudDevolucion[]>("/cliente-portal/devoluciones").catch(
    () => [] as SolicitudDevolucion[],
  );
  const solicitud = solicitudes.find((s) => s.pedido?.folioPublico === pedido.folioPublico) ?? null;
  const devolible = ["entregado", "recogido"].includes(pedido.statusPedido);

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/cuenta" className="text-marca text-sm hover:underline">
        ← Mis pedidos
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-bold text-2xl">Pedido {pedido.folioPublico}</h1>
          <p className="text-gray-500 text-sm">
            {pedido.metodoEnvio === "click_collect" ? "Recoger en tienda" : "Envío a domicilio"} ·{" "}
            {fecha(pedido.createdAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-medium text-sm ${
            pedido.cancelado ? "bg-red-100 text-red-700" : "bg-marca/10 text-marca"
          }`}
        >
          {pedido.statusLabel}
        </span>
      </div>

      {/* Timeline tipo Mercado Libre */}
      {pedido.cancelado ? (
        <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          Este pedido fue cancelado.
          {pedido.canceladoMotivo ? ` Motivo: ${pedido.canceladoMotivo}` : ""}
        </div>
      ) : (
        <ol className="mb-8">
          {pedido.hitos.map((h, i) => {
            const ultimo = i === pedido.hitos.length - 1;
            return (
              <li key={h.estado} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${
                      h.completado
                        ? "border-marca bg-marca text-white"
                        : "border-gray-300 bg-white text-gray-300"
                    }`}
                  >
                    {h.completado ? "✓" : i + 1}
                  </span>
                  {!ultimo && (
                    <span
                      className={`w-0.5 flex-1 ${h.completado ? "bg-marca" : "bg-gray-200"}`}
                      style={{ minHeight: "1.75rem" }}
                    />
                  )}
                </div>
                <div className={`pb-6 ${h.actual ? "font-semibold" : ""}`}>
                  <p className={h.completado ? "text-gray-800" : "text-gray-400"}>{h.label}</p>
                  {h.fecha && <p className="text-gray-400 text-xs">{fecha(h.fecha)}</p>}
                  {h.actual && pedido.guiaTracking && (
                    <p className="mt-1 text-gray-500 text-xs">
                      Guía {pedido.paqueteria}:{" "}
                      <span className="font-mono">{pedido.guiaTracking}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Productos */}
      <h2 className="mb-2 font-bold text-lg">Productos</h2>
      <div className="mb-6 overflow-hidden rounded-lg border bg-white">
        {pedido.items.map((it, idx) => (
          <div
            key={`${idx}-${it.nombre}`}
            className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-b-0"
          >
            <span>
              {it.cantidad} × {it.nombre}
            </span>
            <span className="font-medium">${Number(it.subtotal).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2 text-gray-500 text-sm">
          <span>Envío</span>
          <span>${Number(pedido.costoEnvio).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 font-bold">
          <span>Total</span>
          <span>${Number(pedido.total).toFixed(2)}</span>
        </div>
      </div>

      {pedido.direccionEnvio && (
        <>
          <h2 className="mb-2 font-bold text-lg">Envío</h2>
          <p className="mb-6 text-gray-600 text-sm">
            📍 {pedido.direccionEnvio.calle}, {pedido.direccionEnvio.ciudad},{" "}
            {pedido.direccionEnvio.estado} CP {pedido.direccionEnvio.cp}
          </p>
        </>
      )}

      {(devolible || solicitud) && (
        <div className="mb-6">
          <SolicitarDevolucion
            folio={pedido.folioPublico}
            items={pedido.items}
            devolible={devolible}
            solicitudExistente={
              solicitud
                ? { estado: solicitud.estado, rechazoMotivo: solicitud.rechazoMotivo }
                : null
            }
          />
        </div>
      )}

      <ChatPedidoCliente folio={pedido.folioPublico} />
    </div>
  );
}
