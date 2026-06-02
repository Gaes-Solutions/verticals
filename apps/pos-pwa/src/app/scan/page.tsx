"use client";

import Link from "next/link";
import { useState } from "react";
import { BarcodeScanner } from "../../components/barcode-scanner";

interface ScannedItem {
  code: string;
  at: string;
}

export default function ScanPage() {
  const [items, setItems] = useState<ScannedItem[]>([]);

  function handleScan(code: string) {
    setItems((prev) =>
      [{ code, at: new Date().toLocaleTimeString("es-MX") }, ...prev].slice(0, 50),
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 24 }}>
          ←
        </Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>Escanear</h1>
      </header>

      <BarcodeScanner onScan={handleScan} />

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15, opacity: 0.7 }}>Lecturas ({items.length})</h2>
        {items.length === 0 ? (
          <p style={{ opacity: 0.5, fontSize: 14 }}>Apunta la cámara a un código de barras.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((it) => (
              <li
                key={`${it.code}-${it.at}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "#1e293b",
                  borderRadius: 8,
                  marginBottom: 6,
                  fontFamily: "monospace",
                }}
              >
                <span>{it.code}</span>
                <span style={{ opacity: 0.5 }}>{it.at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
