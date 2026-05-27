import { randomBytes } from "node:crypto";
import {
  type CrearIntentInput,
  PagoError,
  type PagoIntent,
  type PaymentProvider,
  type ReembolsoResult,
  type WebhookEvento,
} from "./types.js";

export interface MockPaymentConfig {
  /** Si true, parseWebhook devuelve status=fallido en vez de confirmado */
  failNextWebhook?: boolean;
}

/**
 * Provider de pagos determinista para dev/tests. Genera intents con id
 * predecible y simula confirmación. Para OXXO/SPEI devuelve referencia fake.
 * `simularWebhook` ayuda a tests a fabricar el payload+signature válidos.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly codigo = "mock" as const;
  private readonly intents = new Map<string, CrearIntentInput>();

  constructor(private readonly opts: MockPaymentConfig = {}) {}

  async crearIntent(input: CrearIntentInput): Promise<PagoIntent> {
    if (input.montoCentavos <= 0) {
      throw new PagoError("montoCentavos debe ser > 0", "INVALID_INPUT");
    }
    const intentId = `mock_pi_${randomBytes(8).toString("hex")}`;
    this.intents.set(intentId, input);
    const offline = input.metodo === "oxxo" || input.metodo === "spei";
    return {
      intentId,
      proveedor: "mock",
      status: offline ? "requiere_accion" : "pendiente",
      clientSecret: `${intentId}_secret`,
      ...(offline
        ? {
            referenciaPago: input.metodo === "oxxo" ? "93000012345678" : "012180001234567890",
            expiraEn: new Date(Date.now() + 3 * 86_400_000),
          }
        : {}),
    };
  }

  /** Fabrica un payload+signature válidos que parseWebhook aceptará (para tests). */
  simularWebhook(intentId: string): { payload: string; signature: string } {
    const input = this.intents.get(intentId);
    const montoCentavos = input?.montoCentavos ?? 0;
    const payload = JSON.stringify({ intentId, montoCentavos });
    return { payload, signature: `mock-sig:${intentId}` };
  }

  parseWebhook(payload: string, signature: string): WebhookEvento {
    let parsed: { intentId?: string; montoCentavos?: number };
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new PagoError("payload inválido", "INVALID_WEBHOOK");
    }
    if (!parsed.intentId || signature !== `mock-sig:${parsed.intentId}`) {
      throw new PagoError("firma inválida", "INVALID_WEBHOOK");
    }
    const status = this.opts.failNextWebhook ? "fallido" : "confirmado";
    this.opts.failNextWebhook = false;
    return {
      intentId: parsed.intentId,
      status,
      montoCentavos: parsed.montoCentavos ?? 0,
      raw: parsed as Record<string, unknown>,
    };
  }

  async reembolsar(intentId: string, _montoCentavos?: number): Promise<ReembolsoResult> {
    if (!this.intents.has(intentId)) {
      throw new PagoError("intent no encontrado", "INTENT_NOT_FOUND");
    }
    return { reembolsoId: `mock_re_${randomBytes(6).toString("hex")}`, status: "procesado" };
  }
}
