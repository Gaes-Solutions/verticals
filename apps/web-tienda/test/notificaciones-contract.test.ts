import { describe, expect, it } from "vitest";
import { enlaceNotificacion } from "../src/lib/notificaciones-contract";
describe("notification navigation", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://other.invalid/",
    "//other.invalid/",
    "/\\other.invalid/",
    "/\n/other.invalid/",
    null,
  ])("rejects unsafe notification link %j", (value) =>
    expect(enlaceNotificacion(value)).toBeNull(),
  );
  it.each(["/cuenta/pedidos/QA", "/producto/producto-qa?opcion=1#detalle", "/cuenta"])(
    "keeps a root-relative storefront destination",
    (value) => expect(enlaceNotificacion(value)).toBe(value),
  );
});
