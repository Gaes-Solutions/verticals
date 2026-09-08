import { randomUUID } from "node:crypto";
import { getTenantClient } from "@gaespos/db";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_LIMITS, type StoragePort } from "../src/modules/tenant/kiosko/media-contract.js";
import {
  authorizeReservedUpload,
  cleanupExpiredMedia,
  finalizeMediaUpload,
  reserveMediaUpload,
} from "../src/modules/tenant/kiosko/media-upload-service.js";
import { createTestTenant } from "./helpers.js";
const A = "test-media-a";
const B = "test-media-b";
const dbA = () => getTenantClient(A);
const dbB = () => getTenantClient(B);
const scopeA = { tenantId: "tenant-a-123", userId: "owner-a" };
const scopeB = { tenantId: "tenant-b-123", userId: "owner-b" };
const input = (bytes = 100) => ({
  tenantId: scopeA.tenantId,
  declaredBytes: bytes,
  contentType: "image/png",
});
function storageFake() {
  const authorizeUpload = vi.fn(
    async (_input: { key: string; maxBytes: number; expiresAt: Date }) => ({
      url: "https://media.invalid/fake-upload",
      headers: {},
    }),
  );
  const remove = vi.fn(async (_key: string) => {});
  const storage: StoragePort = {
    authorizeUpload,
    remove,
    readForInspection: () => {
      throw new Error("No decoder in foundation");
    },
    authorizeRead: async () => {
      throw new Error("No publication in foundation");
    },
  };
  return { storage, authorizeUpload, remove };
}
beforeAll(async () => {
  await createTestTenant(A);
  await createTestTenant(B);
});
beforeEach(async () => {
  for (const db of [dbA(), dbB()]) {
    await db.kioskoMediaUpload.deleteMany();
    await db.kioskoMediaAsset.deleteMany();
  }
});
describe("durable kiosk media foundation", () => {
  it("serializes concurrent reservations with a two-upload tenant cap", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => reserveMediaUpload(dbA(), scopeA, input(), randomUUID())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await dbA().kioskoMediaUpload.count()).toBe(2);
    expect(await dbA().kioskoMediaAsset.count()).toBe(2);
  });
  it("reserving same key concurrently is idempotent and mismatch conflicts", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveMediaUpload(dbA(), scopeA, input(), key)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await dbA().kioskoMediaUpload.count()).toBe(1);
    await expect(reserveMediaUpload(dbA(), scopeA, input(101), key)).rejects.toMatchObject({
      code: "UPLOAD_CONFLICT",
    });
  });
  it("tenant/user boundaries prevent authorizing or finalizing somebody else's session", async () => {
    const upload = await reserveMediaUpload(dbA(), scopeA, input(), randomUUID());
    const fake = storageFake();
    await expect(
      authorizeReservedUpload(dbB(), scopeB, upload.id, fake.storage),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
    await expect(
      finalizeMediaUpload(dbA(), { ...scopeA, userId: "other-user" }, upload.id),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
    await expect(
      reserveMediaUpload(dbA(), scopeA, { ...input(), tenantId: scopeB.tenantId }, randomUUID()),
    ).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    expect(fake.authorizeUpload).not.toHaveBeenCalled();
    await authorizeReservedUpload(dbA(), scopeA, upload.id, fake.storage);
    expect(fake.authorizeUpload).toHaveBeenCalledWith({
      key: upload.asset.storageKey,
      maxBytes: 100,
      expiresAt: upload.expiresAt,
    });
    expect(upload.asset.storageKey).toMatch(/^tenants\/tenant-a-123\/staging\//);
  });
  it("finalization is durable and idempotent but never marks media verified or exposes bytes", async () => {
    const upload = await reserveMediaUpload(dbA(), scopeA, input(), randomUUID());
    const results = await Promise.all(
      Array.from({ length: 6 }, () => finalizeMediaUpload(dbA(), scopeA, upload.id)),
    );
    expect(results.every((r) => r.status === "validating")).toBe(true);
    expect(new Set(results.map((r) => r.inspectionRequestedAt?.toISOString())).size).toBe(1);
    const asset = await dbA().kioskoMediaAsset.findUniqueOrThrow({ where: { id: upload.assetId } });
    expect(asset.status).toBe("validating");
    expect(asset.verifiedMetadata).toBeNull();
    const fake = storageFake();
    await expect(
      authorizeReservedUpload(dbA(), scopeA, upload.id, fake.storage),
    ).rejects.toMatchObject({ code: "UPLOAD_CLOSED" });
    expect(fake.authorizeUpload).not.toHaveBeenCalled();
  });
  it("expiry closes writes/finalization; failed deletion retains quota until acknowledged", async () => {
    const upload = await reserveMediaUpload(dbA(), scopeA, input(), randomUUID());
    await dbA().kioskoMediaUpload.update({
      where: { id: upload.id },
      data: { expiresAt: new Date(0) },
    });
    expect((await finalizeMediaUpload(dbA(), scopeA, upload.id)).status).toBe("expired");
    const fake = storageFake();
    fake.remove.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect(await cleanupExpiredMedia(dbA(), scopeA, fake.storage)).toEqual({ released: 0 });
    expect(
      (await dbA().kioskoMediaUpload.findUniqueOrThrow({ where: { id: upload.id } }))
        .storageReleasedAt,
    ).toBeNull();
    expect(await cleanupExpiredMedia(dbA(), scopeA, fake.storage)).toEqual({ released: 1 });
    expect(await cleanupExpiredMedia(dbA(), scopeA, fake.storage)).toEqual({ released: 0 });
    await expect(
      authorizeReservedUpload(dbA(), scopeA, upload.id, fake.storage),
    ).rejects.toMatchObject({ code: "UPLOAD_CLOSED" });
  });
  it("expired but undeleted objects still consume byte quota, independently of another tenant", async () => {
    for (let i = 0; i < 20; i++) {
      const upload = await reserveMediaUpload(
        dbA(),
        scopeA,
        {
          tenantId: scopeA.tenantId,
          contentType: "video/mp4",
          declaredBytes: MEDIA_LIMITS.videoBytes,
        },
        randomUUID(),
      );
      await dbA().kioskoMediaUpload.update({
        where: { id: upload.id },
        data: { expiresAt: new Date(0) },
      });
    }
    await expect(
      reserveMediaUpload(
        dbA(),
        scopeA,
        {
          tenantId: scopeA.tenantId,
          contentType: "video/mp4",
          declaredBytes: MEDIA_LIMITS.videoBytes,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    const other = await reserveMediaUpload(
      dbB(),
      scopeB,
      {
        tenantId: scopeB.tenantId,
        contentType: "video/mp4",
        declaredBytes: MEDIA_LIMITS.videoBytes,
      },
      randomUUID(),
    );
    expect(other.status).toBe("uploading");
    const fake = storageFake();
    await cleanupExpiredMedia(dbA(), scopeA, fake.storage);
    expect((await reserveMediaUpload(dbA(), scopeA, input(), randomUUID())).status).toBe(
      "uploading",
    );
  });
});
