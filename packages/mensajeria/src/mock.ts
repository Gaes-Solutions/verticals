import { randomBytes } from "node:crypto";
import {
  type CanalMensaje,
  type EnviarMensajeInput,
  type MensajeResult,
  MensajeriaError,
  type MessagingProvider,
} from "./types.js";

interface MockConfig {
  failNext?: boolean;
  /** Créditos por mensaje (WhatsApp ~0.04 USD ≈ 0.7 MXN; SMS ~0.5 MXN) */
  creditosPorMensaje?: number;
}

interface MensajeEnviado {
  destino: string;
  contenido: string;
}

/** Provider determinista para dev/tests. Acumula enviados para verificación. */
export class MockMessagingProvider implements MessagingProvider {
  public readonly enviados: MensajeEnviado[] = [];

  constructor(
    public readonly canal: CanalMensaje,
    private readonly opts: MockConfig = {},
  ) {}

  get proveedor(): string {
    return `mock-${this.canal}`;
  }

  async enviar(input: EnviarMensajeInput): Promise<MensajeResult> {
    if (!input.destino || input.destino.length < 5) {
      throw new MensajeriaError("destino inválido", "INVALID_DESTINO");
    }
    if (this.opts.failNext) {
      this.opts.failNext = false;
      return { proveedorMsgId: "", proveedor: this.proveedor, status: "rechazado", creditos: 0 };
    }
    this.enviados.push({ destino: input.destino, contenido: input.contenido });
    return {
      proveedorMsgId: `mock_msg_${randomBytes(6).toString("hex")}`,
      proveedor: this.proveedor,
      status: "enviado",
      creditos: this.opts.creditosPorMensaje ?? (this.canal === "whatsapp" ? 0.7 : 0.5),
    };
  }
}

export function mockWhatsapp(opts?: MockConfig): MockMessagingProvider {
  return new MockMessagingProvider("whatsapp", opts);
}
export function mockSms(opts?: MockConfig): MockMessagingProvider {
  return new MockMessagingProvider("sms", opts);
}
