import { describe, expect, it } from "vitest";
import { tenantDeUbicacion as pos } from "../../web-pos/src/lib/tenant-host.js";
import { tenantDeUbicacion as admin } from "../src/lib/tenant-host.js";

for (const [surface, resolve] of [
  ["admin", admin],
  ["pos", pos],
] as const) {
  describe(`${surface} business host`, () => {
    it.each([
      "web-admin-staging-84b0.up.railway.app",
      "web-pos-production.up.railway.app",
      "panel.mitienda.com",
      "localhost",
      "127.0.0.1",
      "[::1]",
      "www.gaessoft.mx",
      "admin.gaessoft.mx",
      "pos.gaessoft.mx",
      "gaesland.evil.gaessoft.mx",
      "gaesland.gaessoft.mx.attacker.com",
    ])("does not force an unrelated business on %s", (host) => {
      expect(resolve(host)).toBeNull();
    });
    it.each([
      "gaesland.gaessoft.mx",
      "gaesland.gaessoft.com",
      "gaesland.gaessoft.com.mx",
      "gaesland.localhost",
    ])("recognizes a platform business on %s", (host) => {
      expect(resolve(host)).toBe("gaesland");
    });
    it("honors the explicit business selection on shared hosting", () => {
      expect(resolve("web-admin-staging.up.railway.app", "?negocio=Gaesland")).toBe("gaesland");
    });
  });
}
