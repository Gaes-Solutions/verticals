/** Banner de error de carga con acción de reintento. */
export function EstadoError({ mensaje, onRetry }: { mensaje: string; onRetry: () => void }) {
  return (
    <div className="gx-card flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-danger">{mensaje}</p>
      <button type="button" onClick={onRetry} className="gx-btn-secondary">
        Reintentar
      </button>
    </div>
  );
}
