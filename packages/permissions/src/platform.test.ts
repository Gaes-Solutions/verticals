import { expect, it } from "vitest";
import { PLATFORM_PERMISSIONS, platformPermissions } from "./platform.js";
it("uses minimum distinct defaults and only recognized explicit additions", () => {
  expect(platformPermissions("support")).toEqual([
    "tenants.read",
    "tickets.manage",
    "tickets.read",
  ]);
  expect(platformPermissions("billing")).toEqual([
    "billing.manage",
    "billing.read",
    "tenants.read",
  ]);
  expect(platformPermissions("support", ["billing.read", "*", "team.manage"])).toContain(
    "billing.read",
  );
  expect(platformPermissions("support", ["billing.read", "*"])).not.toContain("billing.manage");
  expect(platformPermissions("support", ["catalog.manage"])).toContain("catalog.read");
  expect(platformPermissions("unknown", ["billing.manage"])).toEqual([]);
  expect(platformPermissions("toString")).toEqual([]);
  expect(platformPermissions("superadmin")).toHaveLength(PLATFORM_PERMISSIONS.length);
});
