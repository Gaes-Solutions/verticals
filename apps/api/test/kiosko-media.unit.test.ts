import { describe, expect, it } from "vitest";
import {
  MEDIA_LIMITS,
  type Publication,
  buildPlaylistPlan,
  planUpload,
  preflightMedia,
  validateDeliveryUrl,
  validateInspectedAsset,
} from "../src/modules/tenant/kiosko/media-contract.js";
const tenantId = "tenant-1234";
const branchId = "branch-1234";
const now = new Date("2026-09-08T12:00:00Z");
const asset = {
  id: "asset-1234",
  tenantId,
  status: "ready" as const,
  mime: "image/png" as const,
  sha256: "a".repeat(64),
  bytes: 100,
  width: 100,
  height: 100,
  durationMs: null,
  codec: null,
  fps: null,
  audioCodec: null,
};
const publication = (): Publication => ({
  id: "publication-1234",
  tenantId,
  branchIds: [branchId],
  status: "published",
  startsAt: now,
  endsAt: new Date(now.getTime() + 5000),
  priority: 1,
  imageDurationMs: 5000,
  asset,
});
const scope = { tenantId, branchId, now };
describe("kiosko media preparatory contracts", () => {
  it("creates server-owned keys and only plans uploads pending inspection", () => {
    const plan = planUpload({ tenantId, declaredBytes: 100, contentType: "image/png" }, tenantId, {
      storedBytes: 0,
      reservedBytes: 0,
      activeUploads: 0,
    });
    expect(plan.key).toMatch(/^tenants\/tenant-1234\/staging\/[a-f0-9-]+$/);
    expect(plan.inspectionRequired).toBe(true);
  });
  it("rejects tenant mismatch, unsupported MIME and extra client paths", () => {
    for (const changes of [
      { tenantId: "other-tenant" },
      { contentType: "text/html" },
      { key: "../other" },
    ])
      expect(() =>
        planUpload(
          { tenantId, declaredBytes: 100, contentType: "image/png", ...changes },
          tenantId,
          { storedBytes: 0, reservedBytes: 0, activeUploads: 0 },
        ),
      ).toThrow();
  });
  it("counts reserved bytes, concurrency and per-format limits", () => {
    const req = { tenantId, declaredBytes: 1, contentType: "image/png" };
    expect(() =>
      planUpload(req, tenantId, {
        storedBytes: MEDIA_LIMITS.tenantBytes - 1,
        reservedBytes: 1,
        activeUploads: 0,
      }),
    ).toThrow(/capacidad/);
    expect(() =>
      planUpload(req, tenantId, { storedBytes: 0, reservedBytes: 0, activeUploads: 2 }),
    ).toThrow();
    expect(() =>
      planUpload({ ...req, declaredBytes: MEDIA_LIMITS.imageBytes + 1 }, tenantId, {
        storedBytes: 0,
        reservedBytes: 0,
        activeUploads: 0,
      }),
    ).toThrow();
  });
  it("rejects corrupt signature and real-size mismatch; matching prefix still needs decoder", () => {
    expect(() => preflightMedia(Buffer.from("<html>bad</html>"), "image/png", 16)).toThrow();
    expect(() => preflightMedia(Buffer.from([255, 216, 255, 217]), "image/jpeg", 100)).toThrow();
    expect(preflightMedia(Buffer.from([255, 216, 255, 217]), "image/jpeg", 4)).toEqual({
      inspectionRequired: true,
    });
  });
  it("rejects decompressed oversized image and unknown video codec/fps", () => {
    expect(() =>
      validateInspectedAsset({ ...asset, width: 4096, height: 4096 }, tenantId),
    ).toThrow();
    expect(() =>
      validateInspectedAsset(
        { ...asset, mime: "video/mp4", durationMs: 5000, codec: "hevc", fps: 30 },
        tenantId,
      ),
    ).toThrow();
    expect(() =>
      validateInspectedAsset(
        { ...asset, mime: "video/mp4", durationMs: 5000, codec: "h264", fps: 60 },
        tenantId,
      ),
    ).toThrow();
  });
  it("includes start boundary, excludes end, draft, withdrawn and other branch", () => {
    expect(buildPlaylistPlan([publication()], scope)).toHaveLength(1);
    for (const changes of [
      { endsAt: now, startsAt: new Date(now.getTime() - 5000) },
      { status: "draft" as const },
      { status: "withdrawn" as const },
      { branchIds: ["branch-5678"] },
    ])
      expect(buildPlaylistPlan([{ ...publication(), ...changes }], scope)).toHaveLength(0);
  });
  it("fails closed on cross-tenant asset, missing ready verification and invalid windows", () => {
    expect(() =>
      buildPlaylistPlan(
        [{ ...publication(), asset: { ...asset, tenantId: "tenant-5678" } }],
        scope,
      ),
    ).toThrow();
    expect(() => validateInspectedAsset({ ...asset, status: "uploading" }, tenantId)).toThrow();
    expect(() =>
      buildPlaylistPlan([{ ...publication(), startsAt: new Date("invalid") }], scope),
    ).toThrow();
  });
  it("limits playlist cardinality and bounds display by campaign end", () => {
    expect(() =>
      buildPlaylistPlan(
        Array.from({ length: 21 }, (_, i) => ({ ...publication(), id: `publication-${i}` })),
        scope,
      ),
    ).toThrow();
    expect(buildPlaylistPlan([publication()], scope)[0]?.validUntil).toEqual(publication().endsAt);
    expect(() => buildPlaylistPlan([publication(), publication()], scope)).toThrow();
  });
  it.each([
    "http://media.example.com/a",
    "https://evil.example.com/a",
    "https://user:pass@media.example.com/a",
    "data:image/png;base64,x",
    "https://media.example.com/a#fragment",
  ])("rejects unsafe delivery URL %s", (raw) => {
    expect(() => validateDeliveryUrl(raw, "https://media.example.com")).toThrow();
  });
  it("allows only configured HTTPS origin", () => {
    expect(
      validateDeliveryUrl(
        "https://media.example.com/a?signature=opaque",
        "https://media.example.com",
      ),
    ).toContain("signature=opaque");
    expect(() => validateDeliveryUrl("https://127.0.0.1/a", "https://127.0.0.1")).toThrow();
  });
});
