import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BarraEnvioGratis } from "../src/components/barra-envio-gratis";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const render = (subtotal: number, umbral: number | null) =>
  renderToStaticMarkup(React.createElement(BarraEnvioGratis, { subtotal, umbral }));

it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_VALUE])(
  "does not advertise shipping with an invalid threshold %s",
  (umbral) => expect(render(100, umbral)).toBe(""),
);
it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_VALUE])(
  "does not advertise shipping with an invalid subtotal %s",
  (subtotal) => expect(render(subtotal, 100)).toBe(""),
);
it.each([
  [0, 100, 0, "$100.00"],
  [50, 100, 50, "$50.00"],
  [99.99, 100, 99, "$0.01"],
  [0.1 + 0.2, 0.31, 96, "$0.01"],
])(
  "shows the remaining money without prematurely reporting 100%%: %s / %s",
  (total, limit, pct, remaining) => {
    const html = render(total, limit);
    expect(html).toContain(`aria-valuenow="${pct}"`);
    expect(html).toContain(remaining);
    expect(html).toContain("Depende de tu dirección y la tarifa elegida");
    expect(html).not.toContain("Alcanzaste");
    expect(html).not.toContain("¡Tienes envío gratis!");
  },
);
it.each([
  [100, 100],
  [300, 100],
  [0, 0],
  [10, 0],
])(
  "reaching the threshold %s / %s still requires the selected address and tariff",
  (total, limit) => {
    const html = render(total, limit);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("Alcanzaste el monto de referencia");
    expect(html).toContain("El costo final se confirma al pagar");
    expect(html).toContain("Envío sujeto a dirección y tarifa");
    expect(html).not.toContain("¡Tienes envío gratis!");
    expect(html).not.toContain("NaN");
  },
);
