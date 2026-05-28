import { describe, expect, it } from "vitest";
import { decideUpdate, detectFieldConflicts, resolveLww } from "./conflict.js";

describe("resolveLww", () => {
  it("gana el más nuevo", () => {
    expect(resolveLww("2026-05-27T10:00:00Z", "2026-05-27T09:00:00Z")).toBe("local");
    expect(resolveLww("2026-05-27T09:00:00Z", "2026-05-27T10:00:00Z")).toBe("remote");
  });
  it("empate ⇒ gana local", () => {
    const t = "2026-05-27T10:00:00Z";
    expect(resolveLww(t, t)).toBe("local");
  });
});

describe("detectFieldConflicts", () => {
  const base = { nombre: "Ana", telefono: "33300", email: "a@x.com" };

  it("sin cambios ⇒ sin conflictos", () => {
    expect(
      detectFieldConflicts(base, { ...base }, { ...base }, ["nombre", "telefono", "email"]),
    ).toEqual([]);
  });

  it("solo un lado cambia ⇒ sin conflicto", () => {
    const local = { ...base, telefono: "99999" };
    const remote = { ...base };
    expect(detectFieldConflicts(base, local, remote, ["nombre", "telefono", "email"])).toEqual([]);
  });

  it("ambos cambian el mismo campo a valores distintos ⇒ conflicto", () => {
    const local = { ...base, telefono: "11111" };
    const remote = { ...base, telefono: "22222" };
    expect(detectFieldConflicts(base, local, remote, ["telefono"])).toEqual(["telefono"]);
  });

  it("ambos cambian el mismo campo al MISMO valor ⇒ sin conflicto", () => {
    const local = { ...base, email: "nuevo@x.com" };
    const remote = { ...base, email: "nuevo@x.com" };
    expect(detectFieldConflicts(base, local, remote, ["email"])).toEqual([]);
  });

  it("campos distintos en cada lado ⇒ sin conflicto", () => {
    const local = { ...base, nombre: "Anita" };
    const remote = { ...base, telefono: "88888" };
    expect(detectFieldConflicts(base, local, remote, ["nombre", "telefono", "email"])).toEqual([]);
  });
});

describe("decideUpdate", () => {
  const base = { nombre: "Ana", telefono: "33300" };
  const remoteUpdatedAt = "2026-05-27T10:00:00Z";

  it("servidor sin cambios desde la base ⇒ aplica", () => {
    const d = decideUpdate({
      base,
      local: { ...base, telefono: "99999" },
      remote: { ...base },
      fields: ["nombre", "telefono"],
      baseUpdatedAt: remoteUpdatedAt,
      remoteUpdatedAt,
    });
    expect(d.action).toBe("apply");
  });

  it("ambos cambiaron el mismo campo ⇒ conflict merge_required", () => {
    const d = decideUpdate({
      base,
      local: { ...base, telefono: "11111" },
      remote: { ...base, telefono: "22222" },
      fields: ["nombre", "telefono"],
      baseUpdatedAt: "2026-05-27T08:00:00Z",
      remoteUpdatedAt,
    });
    expect(d.action).toBe("conflict");
    if (d.action === "conflict") {
      expect(d.conflict.divergentFields).toEqual(["telefono"]);
      expect(d.conflict.reason).toBe("merge_required");
    }
  });

  it("cambios en campos distintos ⇒ merge limpio (apply)", () => {
    const d = decideUpdate({
      base,
      local: { ...base, nombre: "Anita" },
      remote: { ...base, telefono: "88888" },
      fields: ["nombre", "telefono"],
      baseUpdatedAt: "2026-05-27T08:00:00Z",
      remoteUpdatedAt,
    });
    expect(d.action).toBe("apply");
  });

  it("sin base ⇒ LWW: local más nuevo aplica", () => {
    const d = decideUpdate({
      base: null,
      local: { telefono: "11111" },
      remote: { telefono: "22222" },
      fields: ["telefono"],
      remoteUpdatedAt,
      localUpdatedAt: "2026-05-27T11:00:00Z",
    });
    expect(d.action).toBe("apply");
  });

  it("sin base ⇒ LWW: servidor más nuevo ⇒ skip", () => {
    const d = decideUpdate({
      base: null,
      local: { telefono: "11111" },
      remote: { telefono: "22222" },
      fields: ["telefono"],
      remoteUpdatedAt,
      localUpdatedAt: "2026-05-27T09:00:00Z",
    });
    expect(d.action).toBe("skip");
  });
});
