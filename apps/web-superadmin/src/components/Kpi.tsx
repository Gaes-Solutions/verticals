export function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const color =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-slate-800";
  return (
    <div className="gx-card">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className={`mt-1 font-bold text-2xl ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-slate-400 text-xs">{sub}</p>}
    </div>
  );
}
