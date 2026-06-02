import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>GaesSoft POS</h1>
      <p style={{ opacity: 0.7, marginBottom: 32 }}>Punto de venta móvil · offline-first</p>

      <Link
        href="/scan"
        style={{
          display: "block",
          textAlign: "center",
          padding: "18px 24px",
          background: "#22d3ee",
          color: "#0f172a",
          borderRadius: 12,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        📷 Escanear producto
      </Link>

      <p style={{ marginTop: 32, fontSize: 13, opacity: 0.6 }}>
        Las ventas se guardan localmente y se sincronizan al reconectar. Funciona sin internet.
      </p>
    </main>
  );
}
