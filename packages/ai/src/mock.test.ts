import { describe, expect, it } from "vitest";
import { categorizeByHeuristic } from "./heuristic.js";
import { MockAiProvider } from "./mock.js";
import type { AiCategorizeInput } from "./types.js";

const CATEGORIAS_TEST: AiCategorizeInput["categoriasDisponibles"] = [
  { codigoContable: "G-601", nombre: "Papelería", tipo: "gasto" },
  { codigoContable: "G-606", nombre: "Combustibles", tipo: "gasto" },
  { codigoContable: "G-999", nombre: "Sin categoría", tipo: "gasto" },
];

function inputCombustible(): AiCategorizeInput {
  return {
    emisorRfc: "PEM800101AAA",
    emisorRazonSocial: "Gas Express SA de CV",
    total: 1160,
    conceptos: [{ descripcion: "Gasolina Magna 50 lt", claveProdServ: "15101500", importe: 1000 }],
    categoriasDisponibles: [
      {
        codigoContable: "G-606",
        nombre: "Combustibles",
        tipo: "gasto",
        // @ts-expect-error campo extra reglas heurísticas
        claveProdServSatRegex: "^15101",
      },
      ...CATEGORIAS_TEST,
    ],
  };
}

describe("heuristic categorize", () => {
  it("matchea combustible por regex claveProdServ", () => {
    const r = categorizeByHeuristic(inputCombustible());
    expect(r.codigoContable).toBe("G-606");
    expect(r.confianza).toBe(1);
    expect(r.modelo).toBe("heuristic-v1");
  });

  it("retorna G-999 cuando nada matchea", () => {
    const r = categorizeByHeuristic({
      emisorRfc: "X",
      emisorRazonSocial: "X",
      total: 100,
      conceptos: [{ descripcion: "X", claveProdServ: "99999999" }],
      categoriasDisponibles: CATEGORIAS_TEST,
    });
    expect(r.codigoContable).toBe("G-999");
    expect(r.confianza).toBe(0);
  });
});

describe("MockAiProvider", () => {
  it("delega en heurística con confianza boost simulado", async () => {
    const p = new MockAiProvider();
    const r = await p.categorize(inputCombustible());
    expect(r.codigoContable).toBe("G-606");
    expect(r.confianza).toBeGreaterThan(0.5);
    expect(r.modelo).toBe("mock-haiku-4-5");
    expect(r.tokensIn).toBeGreaterThan(0);
    expect(p.categorizeCalls).toBe(1);
  });

  it("respeta setNextCategorize override", async () => {
    const p = new MockAiProvider();
    p.setNextCategorize({
      codigoContable: "G-601",
      confianza: 0.92,
      justificacion: "test override",
      modelo: "mock-test",
      tokensIn: 100,
      tokensOut: 30,
      cachedHit: true,
    });
    const r = await p.categorize(inputCombustible());
    expect(r.codigoContable).toBe("G-601");
    expect(r.cachedHit).toBe(true);
  });

  it("lanza error si setNextError", async () => {
    const p = new MockAiProvider();
    p.setNextError(new Error("rate limit simulado"));
    await expect(p.categorize(inputCombustible())).rejects.toThrow("rate limit");
  });

  it("summarize devuelve resumen truncado", async () => {
    const p = new MockAiProvider();
    const r = await p.summarize({ texto: "uno dos tres cuatro cinco seis siete", maxPalabras: 3 });
    expect(r.resumen).toContain("uno dos tres");
    expect(r.modelo).toBe("mock-haiku-4-5");
  });
});
