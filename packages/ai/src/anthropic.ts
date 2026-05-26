import Anthropic from "@anthropic-ai/sdk";
import { categorizeByHeuristic } from "./heuristic.js";
import {
  type AiCategorizeInput,
  type AiCategorizeResult,
  AiError,
  type AiProvider,
  type AiSummarizeInput,
  type AiSummarizeResult,
} from "./types.js";

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  fallbackOnError?: boolean;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_CATEGORIZE = `Eres un contador mexicano experto. Categorizas CFDIs recibidos (XML SAT 4.0) asignando una cuenta contable de un catálogo cerrado.

Reglas estrictas:
- Solo respondes con JSON válido: { "codigoContable": "G-XXX", "confianza": 0-1, "justificacion": "..." }
- El codigoContable DEBE existir en la lista que te paso. Si dudas, usa G-999 ("Sin categoría asignada") con confianza 0.
- La confianza refleja qué tan seguro estás (0.95+ si claveProdServ y emisor son inequívocos; 0.5-0.7 si solo descripción).
- Justificación: 1-2 frases, español MX, cita la pista decisiva (clave SAT, palabra en descripción, naturaleza del emisor).
- NO inventes códigos contables. NO devuelvas texto fuera del JSON.`;

export class AnthropicClient implements AiProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly fallbackOnError: boolean;

  constructor(opts: AnthropicClientOptions) {
    if (!opts.apiKey || opts.apiKey.startsWith("stub-")) {
      throw new AiError("Anthropic apiKey faltante o stub", "PROVIDER_UNAVAILABLE");
    }
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.fallbackOnError = opts.fallbackOnError ?? true;
  }

  async categorize(input: AiCategorizeInput): Promise<AiCategorizeResult> {
    try {
      const catalogoMd = input.categoriasDisponibles
        .map(
          (c) =>
            `- **${c.codigoContable}** (${c.tipo}): ${c.nombre}${c.descripcion ? ` — ${c.descripcion}` : ""}`,
        )
        .join("\n");
      const conceptosMd = input.conceptos
        .map(
          (c, i) =>
            `${i + 1}. ${c.descripcion}${c.claveProdServ ? ` [claveProdServ=${c.claveProdServ}]` : ""}${c.importe ? ` — $${c.importe}` : ""}`,
        )
        .join("\n");
      const userMsg = `**Emisor:** ${input.emisorRazonSocial} (${input.emisorRfc})
**Total:** $${input.total} MXN

**Conceptos:**
${conceptosMd}

**Catálogo contable disponible:**
${catalogoMd}

Responde solo el JSON con la cuenta contable que mejor aplica.`;

      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 400,
        system: [
          {
            type: "text",
            text: SYSTEM_CATEGORIZE,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMsg }],
      });
      const textBlock = resp.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new AiError("Respuesta sin texto", "INVALID_RESPONSE");
      }
      const parsed = parseJsonResponse(textBlock.text);
      if (!input.categoriasDisponibles.some((c) => c.codigoContable === parsed.codigoContable)) {
        throw new AiError(
          `Modelo devolvió codigoContable inexistente: ${parsed.codigoContable}`,
          "INVALID_RESPONSE",
        );
      }
      const cacheReadTokens = (resp.usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens;
      return {
        codigoContable: parsed.codigoContable,
        confianza: clamp01(parsed.confianza),
        justificacion: parsed.justificacion,
        modelo: this.model,
        tokensIn: resp.usage.input_tokens,
        tokensOut: resp.usage.output_tokens,
        cachedHit: typeof cacheReadTokens === "number" && cacheReadTokens > 0,
      };
    } catch (err) {
      if (!this.fallbackOnError) throw err;
      const heur = categorizeByHeuristic(input);
      return {
        ...heur,
        justificacion: `Fallback IA→heurística por error: ${err instanceof Error ? err.message : "unknown"}; ${heur.justificacion}`,
      };
    }
  }

  async summarize(input: AiSummarizeInput): Promise<AiSummarizeResult> {
    const max = input.maxPalabras ?? 50;
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: max * 4,
      system: `Resume en máximo ${max} palabras, español MX, claro y conciso.`,
      messages: [{ role: "user", content: input.texto }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new AiError("Respuesta sin texto", "INVALID_RESPONSE");
    }
    return {
      resumen: textBlock.text.trim(),
      modelo: this.model,
      tokensIn: resp.usage.input_tokens,
      tokensOut: resp.usage.output_tokens,
    };
  }
}

interface CategorizeResponse {
  codigoContable: string;
  confianza: number;
  justificacion: string;
}

function parseJsonResponse(text: string): CategorizeResponse {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiError(`JSON inválido en respuesta: ${cleaned.slice(0, 200)}`, "INVALID_RESPONSE");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { codigoContable: unknown }).codigoContable !== "string" ||
    typeof (parsed as { confianza: unknown }).confianza !== "number" ||
    typeof (parsed as { justificacion: unknown }).justificacion !== "string"
  ) {
    throw new AiError("Schema JSON inesperado", "INVALID_RESPONSE");
  }
  return parsed as CategorizeResponse;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
