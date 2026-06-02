"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

export interface BarcodeScannerProps {
  onScan: (code: string) => void;
  /** Pausa entre lecturas del mismo código para no disparar múltiples ventas. */
  debounceMs?: number;
}

/**
 * Wrapper de @zxing/browser sobre la cámara trasera. Decodifica EAN/UPC/Code128
 * en vivo. Maneja permisos denegados y limpia el stream al desmontar.
 *
 * Requiere HTTPS (o localhost) y permiso de cámara — no funciona en SSR ni en
 * entornos headless; por eso es un client component aislado.
 */
export function BarcodeScanner({ onScan, debounceMs = 1500 }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    async function start() {
      try {
        const video = videoRef.current;
        if (!video) return;
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          const last = lastScanRef.current;
          if (code === last.code && now - last.at < debounceMs) return;
          lastScanRef.current = { code, at: now };
          onScan(code);
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setActive(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No se pudo acceder a la cámara";
        setError(msg);
      }
    }

    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      setActive(false);
    };
  }, [onScan, debounceMs]);

  if (error) {
    return (
      <div style={{ padding: 16, color: "#fca5a5" }}>
        <p>⚠️ {error}</p>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          Otorga permiso de cámara y abre la app por HTTPS para escanear.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* biome-ignore lint/a11y/useMediaCaption: stream de cámara en vivo, sin pista de subtítulos */}
      <video ref={videoRef} style={{ width: "100%", borderRadius: 12, background: "#000" }} />
      <div
        style={{
          position: "absolute",
          inset: "20% 12%",
          border: "2px solid #22d3ee",
          borderRadius: 12,
          pointerEvents: "none",
          opacity: active ? 1 : 0.3,
        }}
      />
    </div>
  );
}
