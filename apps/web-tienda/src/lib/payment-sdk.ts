const pending = new Map<string, Promise<void>>();
/** Share only the script download. Each form owns its payment instance and callbacks. */
export function loadPaymentSdk(url: string, available: () => boolean): Promise<void> {
  if (available()) return Promise.resolve();
  const existing = pending.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (ok) resolve();
      else {
        script.remove();
        reject(new Error("No se pudo cargar el formulario seguro. Reintenta la carga."));
      }
    };
    const timer = setTimeout(() => finish(false), 12000);
    script.onload = () => finish(available());
    script.onerror = () => finish(false);
    try {
      document.head.appendChild(script);
    } catch {
      finish(false);
    }
  }).finally(() => {
    if (pending.get(url) === promise) pending.delete(url);
  });
  pending.set(url, promise);
  return promise;
}
