import { createHash, randomBytes } from "node:crypto";
import { type AdminUser, type MasterPrismaClient, masterPrisma } from "@gaespos/db";
import { verify as verifyArgon2 } from "@node-rs/argon2";

const REFRESH_TOKEN_BYTES = 48;

export function hashRefreshToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await verifyArgon2(hash, plaintext);
  } catch {
    return false;
  }
}

export async function findActiveAdminByEmail(
  email: string,
  client: MasterPrismaClient = masterPrisma,
): Promise<AdminUser | null> {
  return client.adminUser.findFirst({
    where: { email: email.toLowerCase(), active: true },
  });
}

export interface CreateRefreshTokenInput {
  adminUserId: string;
  ttlDays: number;
  userAgent?: string;
  ipAddress?: string;
}

export async function createRefreshToken(
  input: CreateRefreshTokenInput,
  client: MasterPrismaClient = masterPrisma,
): Promise<{ plaintext: string; expiresAt: Date }> {
  const plaintext = generateRefreshToken();
  const tokenHash = hashRefreshToken(plaintext);
  const expiresAt = new Date(Date.now() + input.ttlDays * 24 * 60 * 60 * 1000);

  await client.refreshToken.create({
    data: {
      tokenHash,
      adminUserId: input.adminUserId,
      expiresAt,
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    },
  });

  return { plaintext, expiresAt };
}

export async function findValidRefreshToken(
  plaintext: string,
  client: MasterPrismaClient = masterPrisma,
): Promise<{ adminUser: AdminUser; tokenId: string } | null> {
  const tokenHash = hashRefreshToken(plaintext);
  const token = await client.refreshToken.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });
  if (!token) return null;
  if (token.revokedAt !== null) return null;
  if (token.expiresAt < new Date()) return null;
  if (!token.adminUser.active) return null;
  return { adminUser: token.adminUser, tokenId: token.id };
}

export async function revokeRefreshToken(
  tokenId: string,
  client: MasterPrismaClient = masterPrisma,
): Promise<void> {
  await client.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshTokenByPlaintext(
  plaintext: string,
  client: MasterPrismaClient = masterPrisma,
): Promise<void> {
  const tokenHash = hashRefreshToken(plaintext);
  await client.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
