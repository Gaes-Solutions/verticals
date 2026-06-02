"use client";

import { useEffect } from "react";

/** Registra el service worker offline-first al montar la app. */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW opcional: la app funciona sin él, solo pierde el cache offline del shell
    });
  }, []);
  return null;
}
