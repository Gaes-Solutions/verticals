"use client";

import { useEffect } from "react";

/** Registra el service worker en toda la tienda para que sea instalable (PWA). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
