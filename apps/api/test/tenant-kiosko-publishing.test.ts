import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTenantClient } from "@gaespos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const slug = "test-kiosko-publishing";
let app: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;
let deviceToken: string;
let branchId: string;
let root: string;
let assetId: string;
let publicationId: string;
let url: string;
const db = () => getTenantClient(slug);
const headers = () => ({ authorization: `Bearer ${token}` });
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "gaes-media-"));
  process.env.KIOSKO_MEDIA_ROOT = root;
  app = await buildTestApp();
  await createTestTenant(slug);
  await createTenantUser(slug, {
    email: "media@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  token = (await loginTenantUser(app, slug, "media@test.local", "ChangeMe!2026")).accessToken;
  branchId = (await db().sucursal.findFirstOrThrow()).id;
  const device = await app.inject({
    method: "POST",
    url: "/t/kioskos",
    headers: headers(),
    payload: { nombre: "Kiosko test", sucursalId: branchId },
  });
  expect(device.statusCode, device.body).toBe(201);
  deviceToken = device.json().token;
});
afterAll(async () => {
  await app?.close();
  await rm(root, { recursive: true, force: true });
  Reflect.deleteProperty(process.env, "KIOSKO_MEDIA_ROOT");
});
async function reserve(bytes: Buffer, contentType = "video/mp4") {
  const res = await app.inject({
    method: "POST",
    url: "/t/kioskos/media/uploads",
    headers: headers(),
    payload: { declaredBytes: bytes.length, contentType, requestKey: randomUUID() },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { id: string; assetId: string };
}
describe("kiosk publication with real isolated decoder", () => {
  it("inspects a real MP4 then publishes to the selected branch", async () => {
    const bytes = await readFile(new URL("./fixtures/kiosko-valid.mp4", import.meta.url));
    const session = await reserve(bytes);
    const upload = await app.inject({
      method: "PUT",
      url: `/t/kioskos/media/uploads/${session.id}`,
      headers: { ...headers(), "content-type": "application/octet-stream" },
      payload: bytes,
    });
    expect(upload.statusCode, upload.body).toBe(200);
    expect(upload.json().status).toBe("ready");
    assetId = session.assetId;
    const pub = await app.inject({
      method: "POST",
      url: "/t/kioskos/media/publications",
      headers: headers(),
      payload: {
        assetId,
        title: "Anuncio real",
        branchIds: [branchId],
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
      },
    });
    expect(pub.statusCode, pub.body).toBe(200);
    publicationId = pub.json().id;
    const idle = await app.inject({
      url: "/kiosko/idle",
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(idle.statusCode, idle.body).toBe(200);
    url = idle.json().slides.find((s: { id: string }) => s.id === publicationId).video;
    const read = await app.inject({ url, headers: { range: "bytes=0-23" } });
    expect(read.statusCode, read.body).toBe(206);
    expect(read.rawPayload).toEqual(bytes.subarray(0, 24));
    expect(read.headers["cache-control"]).toContain("no-store");
  });
  it("refuses forged media, and never publishes it", async () => {
    const bytes = Buffer.from("this is not a real MP4 video");
    const session = await reserve(bytes);
    const upload = await app.inject({
      method: "PUT",
      url: `/t/kioskos/media/uploads/${session.id}`,
      headers: { ...headers(), "content-type": "application/octet-stream" },
      payload: bytes,
    });
    expect(upload.statusCode).toBe(422);
    expect(
      (await db().kioskoMediaAsset.findUniqueOrThrow({ where: { id: session.assetId } })).status,
    ).toBe("rejected");
  });
  it("requires a valid scoped signature", async () => {
    expect((await app.inject({ url: `/kiosko/media/${publicationId}?token=bad` })).statusCode).toBe(
      401,
    );
    const other = url.replace(publicationId, randomUUID());
    expect((await app.inject({ url: other })).statusCode).toBe(403);
  });
  it("withdrawal revokes even an already issued URL", async () => {
    const withdrawn = await app.inject({
      method: "DELETE",
      url: `/t/kioskos/media/publications/${publicationId}`,
      headers: headers(),
    });
    expect(withdrawn.statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
    const del = await app.inject({
      method: "DELETE",
      url: `/t/kioskos/media/assets/${assetId}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(204);
    expect(
      (await db().kioskoMediaUpload.findUniqueOrThrow({ where: { assetId } })).storageReleasedAt,
    ).not.toBeNull();
  });
});
