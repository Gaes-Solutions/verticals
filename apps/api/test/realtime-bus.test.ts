import { describe, expect, it } from "vitest";
import { canalCliente, canalUsuario, publish, subscribe } from "../src/realtime/bus.js";

describe("realtime bus (SSE)", () => {
  it("entrega eventos a los suscriptores del canal", () => {
    const recibidos: unknown[] = [];
    const unsub = subscribe(canalUsuario("u1"), (e) => recibidos.push(e));
    publish(canalUsuario("u1"), { type: "notificacion", tipo: "pedido_nuevo" });
    expect(recibidos).toHaveLength(1);
    expect((recibidos[0] as { tipo: string }).tipo).toBe("pedido_nuevo");
    unsub();
  });

  it("no entrega a otros canales", () => {
    const recibidos: unknown[] = [];
    const unsub = subscribe(canalCliente("c1"), (e) => recibidos.push(e));
    publish(canalCliente("c2"), { type: "notificacion" });
    expect(recibidos).toHaveLength(0);
    unsub();
  });

  it("tras desuscribir ya no recibe", () => {
    const recibidos: unknown[] = [];
    const unsub = subscribe(canalUsuario("u2"), (e) => recibidos.push(e));
    unsub();
    publish(canalUsuario("u2"), { type: "mensaje", pedidoId: "p1" });
    expect(recibidos).toHaveLength(0);
  });
});
