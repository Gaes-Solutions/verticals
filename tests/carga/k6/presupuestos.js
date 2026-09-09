import { check, group } from "k6";
// Pruebas de carga de los presupuestos de rendimiento de CLAUDE.md.
//
// Requiere k6 instalado (https://k6.io/docs/get-started/installation/).
// NUNCA apuntar a producción: usa la API local con datos sembrados.
//
//   BASE_URL=http://localhost:3000 TOKEN=<jwt> SUCURSAL_ID=<id> CAJA_ID=<id> \
//   VARIANTE_ID=<id> CODIGO=<barras> k6 run tests/carga/k6/presupuestos.js
import http from "k6/http";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.TOKEN || "";
const SUCURSAL_ID = __ENV.SUCURSAL_ID || "";
const CAJA_ID = __ENV.CAJA_ID || "";
const VARIANTE_ID = __ENV.VARIANTE_ID || "";
const CODIGO = __ENV.CODIGO || "";

const busqueda = new Trend("busqueda_producto", true);
const preview = new Trend("agregar_linea", true);
const checkout = new Trend("checkout_completo", true);

// Presupuestos no negociables (CLAUDE.md). Si un umbral falla, k6 sale con error.
export const options = {
  scenarios: {
    carga: { executor: "constant-vus", vus: 10, duration: "30s" },
  },
  thresholds: {
    "busqueda_producto{}": ["p(95)<100"],
    "agregar_linea{}": ["p(95)<50"],
    "checkout_completo{}": ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

export default function () {
  group("busqueda de producto", () => {
    const r = http.get(`${BASE}/t/productos/buscar/${CODIGO}`, { headers });
    busqueda.add(r.timings.duration);
    check(r, { "busqueda 200": (x) => x.status === 200 });
  });

  group("agregar linea (preview de venta)", () => {
    const body = JSON.stringify({
      sucursalId: SUCURSAL_ID,
      canal: "pos",
      lineas: [{ varianteId: VARIANTE_ID, cantidad: "1" }],
    });
    const r = http.post(`${BASE}/t/ventas/preview`, body, { headers });
    preview.add(r.timings.duration);
    check(r, { "preview 200": (x) => x.status === 200 });
  });

  group("checkout completo sin CFDI", () => {
    const body = JSON.stringify({
      sucursalId: SUCURSAL_ID,
      cajaId: CAJA_ID,
      lineas: [{ varianteId: VARIANTE_ID, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto: "1000" }],
    });
    const r = http.post(`${BASE}/t/ventas`, body, { headers });
    checkout.add(r.timings.duration);
    check(r, { "venta 201": (x) => x.status === 201 });
  });
}
