"use client";

export interface CheckoutAttempt {
  context: string;
  key: string;
  submitted: boolean;
}
const KEY = "gaespos_checkout_attempt_v1";

async function exclusive<T>(fn: () => T): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      "Este navegador no permite proteger los reintentos. Usa un navegador actualizado para pagar.",
    );
  return navigator.locks.request(KEY, fn);
}

function readAttempt(): CheckoutAttempt | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const item = JSON.parse(raw) as CheckoutAttempt;
  if (
    typeof item.context !== "string" ||
    typeof item.key !== "string" ||
    typeof item.submitted !== "boolean"
  )
    throw new Error(
      "No se pudo recuperar el intento anterior. Contacta a la tienda antes de volver a pagar.",
    );
  return item;
}

export function prepareAttempt(context: string): Promise<CheckoutAttempt> {
  return exclusive(() => {
    const current = readAttempt();
    if (current?.submitted && current.context !== context)
      throw new Error(
        "La sesión cambió y hay una compra por verificar. No vuelvas a pagar; contacta a la tienda.",
      );
    if (current?.context === context) return current;
    const attempt = { context, key: crypto.randomUUID(), submitted: false };
    localStorage.setItem(KEY, JSON.stringify(attempt));
    return attempt;
  });
}

export function submitAttempt(attempt: CheckoutAttempt): Promise<boolean> {
  return exclusive(() => {
    const current = readAttempt();
    if (!current || current.context !== attempt.context || current.key !== attempt.key)
      throw new Error("El intento de compra cambió. Recarga la página para verificarlo.");
    if (current.submitted) return false;
    localStorage.setItem(KEY, JSON.stringify({ ...current, submitted: true }));
    return true;
  });
}

export function completeAttempt(attempt: CheckoutAttempt, clearCart: () => void): Promise<void> {
  return exclusive(() => {
    const current = readAttempt();
    if (current?.context !== attempt.context || current.key !== attempt.key) return;
    clearCart();
    localStorage.removeItem(KEY);
  });
}
