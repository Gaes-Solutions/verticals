import type { TenantPrismaClient } from "@gaespos/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actualizarDireccion } from "../src/modules/cliente-portal/direcciones-service.js";
const addresses = { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const client = { clienteDireccion: addresses } as unknown as TenantPrismaClient;
const data = { etiqueta: "Casa", calle: "Calle QA", estado: "Estado QA", codigoPostal: "06060" };
describe("explicit default-address preference", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    addresses.findFirst.mockResolvedValue({ id: "qa-address" });
  });
  it("persists an explicit false instead of leaving the default checkbox checked", async () => {
    expect(
      await actualizarDireccion(client, "qa-buyer", "qa-address", {
        ...data,
        isDefaultEnvio: false,
      }),
    ).toBe(true);
    expect(addresses.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefaultEnvio: false }) }),
    );
    expect(addresses.updateMany).not.toHaveBeenCalled();
  });
  it("leaves the preference untouched when omitted", async () => {
    await actualizarDireccion(client, "qa-buyer", "qa-address", data);
    expect(addresses.update.mock.calls[0]?.[0].data).not.toHaveProperty("isDefaultEnvio");
    expect(addresses.updateMany).not.toHaveBeenCalled();
  });
  it("marks default and clears only other addresses of the same buyer", async () => {
    await actualizarDireccion(client, "qa-buyer", "qa-address", { ...data, isDefaultEnvio: true });
    expect(addresses.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefaultEnvio: true }) }),
    );
    expect(addresses.updateMany).toHaveBeenCalledWith({
      where: { clienteId: "qa-buyer", id: { not: "qa-address" } },
      data: { isDefaultEnvio: false },
    });
  });
  it("does not update an address outside the buyer account", async () => {
    addresses.findFirst.mockResolvedValue(null);
    expect(
      await actualizarDireccion(client, "another-buyer", "qa-address", {
        ...data,
        isDefaultEnvio: false,
      }),
    ).toBe(false);
    expect(addresses.findFirst).toHaveBeenCalledWith({
      where: { id: "qa-address", clienteId: "another-buyer" },
    });
    expect(addresses.update).not.toHaveBeenCalled();
    expect(addresses.updateMany).not.toHaveBeenCalled();
  });
});
