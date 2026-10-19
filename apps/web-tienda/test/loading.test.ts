import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Loading from "../src/app/loading";
afterEach(() => vi.unstubAllGlobals());
it("renders an informative neutral server fallback without page props", () => {
  vi.stubGlobal("React", React);
  const fallback = Loading();
  expect(fallback).not.toBeInstanceOf(Promise);
  const html = renderToStaticMarkup(fallback);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-label="Cargando tienda"');
  expect(html).toContain("Estamos preparando la tienda");
  expect(html).toContain("<output");
  expect(html.match(/aria-hidden="true"/g)).toHaveLength(8);
  expect(html).not.toContain("<aside");
  expect(html).not.toContain("h-40");
  expect(html).toContain("motion-safe:animate-pulse");
});
