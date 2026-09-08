export function cashCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
export function cashTender(
  total: number,
  received: string,
): { monto: number; cambio: number } | null {
  if (!Number.isFinite(total) || total < 0) return null;
  const due = cashCents(total.toFixed(2));
  const paid = cashCents(received);
  if (due === null || paid === null || paid < due) return null;
  return { monto: paid / 100, cambio: (paid - due) / 100 };
}
