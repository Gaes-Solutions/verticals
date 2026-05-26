import { categorizeByHeuristic } from "./heuristic.js";
import type {
  AiCategorizeInput,
  AiCategorizeResult,
  AiProvider,
  AiSummarizeInput,
  AiSummarizeResult,
} from "./types.js";

/**
 * Mock IA determinista para tests. Por default delega en heurística
 * pero reporta como si fuera modelo IA real (con tokens simulados).
 * Tests pueden inyectar respuestas custom via `setNextCategorize`.
 */
export class MockAiProvider implements AiProvider {
  private nextCategorize: AiCategorizeResult | undefined;
  private nextError: Error | undefined;
  public categorizeCalls = 0;
  public summarizeCalls = 0;

  setNextCategorize(result: AiCategorizeResult): void {
    this.nextCategorize = result;
  }

  setNextError(err: Error): void {
    this.nextError = err;
  }

  async categorize(input: AiCategorizeInput): Promise<AiCategorizeResult> {
    this.categorizeCalls++;
    if (this.nextError) {
      const e = this.nextError;
      this.nextError = undefined;
      throw e;
    }
    if (this.nextCategorize) {
      const r = this.nextCategorize;
      this.nextCategorize = undefined;
      return r;
    }
    const heur = categorizeByHeuristic(input);
    return {
      ...heur,
      modelo: "mock-haiku-4-5",
      confianza: heur.confianza > 0 ? Math.min(0.95, heur.confianza + 0.3) : 0.5,
      justificacion: `[mock] ${heur.justificacion}`,
      tokensIn: 250,
      tokensOut: 80,
    };
  }

  async summarize(input: AiSummarizeInput): Promise<AiSummarizeResult> {
    this.summarizeCalls++;
    const maxPalabras = input.maxPalabras ?? 30;
    const palabras = input.texto.split(/\s+/).slice(0, maxPalabras);
    return {
      resumen: `${palabras.join(" ")}…`,
      modelo: "mock-haiku-4-5",
      tokensIn: Math.ceil(input.texto.length / 4),
      tokensOut: Math.ceil(palabras.join(" ").length / 4),
    };
  }
}
