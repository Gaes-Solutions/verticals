import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Agente {
  id: string;
  name: string;
  email: string;
}

interface TicketListItem {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  lastMessageAt: string;
  tenant: { slug: string; name: string } | null;
  assignedTo: { name: string; email: string } | null;
  _count: { messages: number };
}

interface TicketMessage {
  id: string;
  authorType: string;
  authorEmail: string;
  body: string;
  internalNote: boolean;
  createdAt: string;
}

interface TicketDetail extends Omit<TicketListItem, "_count"> {
  assignedTo: { id: string; name: string; email: string } | null;
  createdByEmail: string;
  messages: TicketMessage[];
}

const STATUS: Record<string, string> = {
  open: "Abierto",
  pending: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
};
const PRIORITY: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
const CATEGORY: Record<string, string> = {
  billing: "Facturación",
  technical: "Técnico",
  onboarding: "Onboarding",
  account: "Cuenta",
  other: "Otro",
};

function statusBadge(s: string): string {
  if (s === "resolved") return "gx-badge-ok";
  if (s === "pending") return "gx-badge-warn";
  if (s === "closed") return "gx-badge";
  return "gx-badge-info";
}
function priorityBadge(p: string): string {
  if (p === "urgent") return "gx-badge-danger";
  if (p === "high") return "gx-badge-warn";
  if (p === "low") return "gx-badge";
  return "gx-badge-info";
}
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function TicketsPage() {
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(() => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set("status", fStatus);
    if (fPriority) qs.set("priority", fPriority);
    const s = qs.toString();
    api<TicketListItem[]>(`/admin/tickets${s ? `?${s}` : ""}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [fStatus, fPriority]);

  useEffect(() => cargar(), [cargar]);
  useEffect(() => {
    api<Agente[]>("/admin/tickets/agentes")
      .then(setAgentes)
      .catch(() => setAgentes([]));
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Soporte</h1>
          <p className="text-slate-500 text-sm">Bandeja de tickets de los clientes.</p>
        </div>
        <button type="button" onClick={() => setCreando(true)} className="gx-btn-primary">
          + Nuevo ticket
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={fPriority}
          onChange={(e) => setFPriority(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Cualquier prioridad</option>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Asunto</th>
              <th className="gx-th">Cliente</th>
              <th className="gx-th">Prioridad</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th">Asignado</th>
              <th className="gx-th">Última actividad</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="gx-td font-medium">
                  {t.subject}
                  <span className="ml-2 text-slate-400 text-xs">{t._count.messages} msj</span>
                </td>
                <td className="gx-td text-slate-500">{t.tenant?.name ?? "—"}</td>
                <td className="gx-td">
                  <span className={priorityBadge(t.priority)}>{PRIORITY[t.priority]}</span>
                </td>
                <td className="gx-td">
                  <span className={statusBadge(t.status)}>{STATUS[t.status]}</span>
                </td>
                <td className="gx-td text-slate-500">{t.assignedTo?.name ?? "Sin asignar"}</td>
                <td className="gx-td text-slate-400 text-xs">{fechaHora(t.lastMessageAt)}</td>
                <td className="gx-td text-right">
                  <button
                    type="button"
                    onClick={() => setAbierto(t.id)}
                    className="font-semibold text-brand text-sm hover:underline"
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={7}>
                  Sin tickets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creando && (
        <CrearTicketModal
          onClose={() => setCreando(false)}
          onDone={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}
      {abierto && (
        <TicketDetalleModal
          ticketId={abierto}
          agentes={agentes}
          onClose={() => setAbierto(null)}
          onChange={cargar}
        />
      )}
    </div>
  );
}

function CrearTicketModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("other");
  const [createdByEmail, setCreatedByEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (subject.trim().length < 2 || mensaje.trim().length < 1) {
      setErr("Asunto y mensaje son obligatorios");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api("/admin/tickets", {
        body: {
          subject: subject.trim(),
          mensaje: mensaje.trim(),
          priority,
          category,
          ...(tenantSlug.trim() ? { tenantSlug: tenantSlug.trim() } : {}),
          ...(createdByEmail.trim() ? { createdByEmail: createdByEmail.trim() } : {}),
        },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Nuevo ticket</h2>
        <div className="space-y-3">
          <Field label="Asunto">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="gx-input"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cliente (slug, opcional)">
              <input
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                className="gx-input"
                placeholder="tienda-demo"
              />
            </Field>
            <Field label="Correo del cliente (opcional)">
              <input
                value={createdByEmail}
                onChange={(e) => setCreatedByEmail(e.target.value)}
                className="gx-input"
              />
            </Field>
            <Field label="Prioridad">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="gx-input"
              >
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categoría">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="gx-input"
              >
                {Object.entries(CATEGORY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Mensaje">
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={4}
              className="gx-input"
            />
          </Field>
          {err && <p className="text-danger text-sm">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Creando…" : "Crear ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketDetalleModal({
  ticketId,
  agentes,
  onClose,
  onChange,
}: {
  ticketId: string;
  agentes: Agente[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [nota, setNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<TicketDetail>(`/admin/tickets/${ticketId}`)
      .then(setTicket)
      .catch(() => setTicket(null));
  }, [ticketId]);

  useEffect(() => cargar(), [cargar]);

  async function patch(data: Record<string, unknown>) {
    setErr(null);
    try {
      await api(`/admin/tickets/${ticketId}`, { method: "PATCH", body: data });
      cargar();
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    }
  }

  async function responder() {
    if (respuesta.trim().length < 1) return;
    setEnviando(true);
    setErr(null);
    try {
      await api(`/admin/tickets/${ticketId}/mensajes`, {
        body: { body: respuesta.trim(), internalNote: nota },
      });
      setRespuesta("");
      setNota(false);
      cargar();
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-2xl">
        {!ticket ? (
          <p className="text-slate-400 text-sm">Cargando…</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-lg text-slate-800">{ticket.subject}</h2>
                <p className="text-slate-500 text-sm">
                  {ticket.tenant?.name ?? "Sin cliente"} · {CATEGORY[ticket.category]} ·{" "}
                  {ticket.createdByEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={ticket.status}
                onChange={(e) => patch({ status: e.target.value })}
                className="gx-input"
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={ticket.priority}
                onChange={(e) => patch({ priority: e.target.value })}
                className="gx-input"
              >
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={ticket.assignedTo?.id ?? ""}
                onChange={(e) => patch({ assignedToId: e.target.value || null })}
                className="gx-input"
              >
                <option value="">Sin asignar</option>
                {agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 max-h-72 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3">
              {ticket.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 text-sm ${
                    m.internalNote
                      ? "border border-amber-200 bg-amber-50"
                      : m.authorType === "admin"
                        ? "bg-brand/10"
                        : "bg-white"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">
                      {m.authorEmail}
                      {m.internalNote && <span className="ml-2 text-amber-700">nota interna</span>}
                    </span>
                    <span className="text-slate-400">{fechaHora(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700">{m.body}</p>
                </div>
              ))}
            </div>

            <textarea
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={3}
              placeholder="Escribe una respuesta…"
              className="gx-input mb-2"
            />
            {err && <p className="mb-2 text-danger text-sm">{err}</p>}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-slate-600 text-sm">
                <input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} />
                Nota interna (no visible al cliente)
              </label>
              <button
                type="button"
                onClick={responder}
                disabled={enviando || respuesta.trim().length < 1}
                className="gx-btn-primary"
              >
                {enviando ? "Enviando…" : "Responder"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block font-medium text-slate-600 text-sm">{label}</span>
      {children}
    </div>
  );
}
