/**
 * Helper de desarrollo: genera tokens de sesión listos para pegar en el navegador
 * (o usar con curl) y así entrar a probar sin pasar por la UI/2FA cada vez.
 *
 *   tsx dev-tokens.ts super
 *   tsx dev-tokens.ts code            (solo el código TOTP del superadmin)
 *   tsx dev-tokens.ts tenant <slug> <email> <password>
 */
import { getTenantClient, masterPrisma } from "@gaespos/db";
import { hash as argon2Hash } from "@node-rs/argon2";
import { authenticator } from "otplib";

const API = process.env.API_URL ?? "http://localhost:3000";
const SUPER_EMAIL = process.env.SUPER_EMAIL ?? "admin@gaessoft.local";
const SUPER_PASS = process.env.SUPER_PASS ?? "ChangeMe!2026";

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function superCode(): Promise<string> {
  const admin = await masterPrisma.adminUser.findUniqueOrThrow({
    where: { email: SUPER_EMAIL },
    select: { mfaSecret: true },
  });
  if (!admin.mfaSecret) throw new Error("Superadmin sin 2FA enrolado; entra una vez por la UI.");
  return authenticator.generate(admin.mfaSecret);
}

async function superToken() {
  const login = await post("/auth/login", { email: SUPER_EMAIL, password: SUPER_PASS });
  if (!login.mfaToken) throw new Error(`Login falló: ${JSON.stringify(login)}`);
  const code = await superCode();
  const verify = await post("/auth/mfa/verify", { code }, login.mfaToken as string);
  if (!verify.accessToken) throw new Error(`Verify falló: ${JSON.stringify(verify)}`);
  console.log(`TOKEN=${verify.accessToken}`);
  console.log(`ROLE=${(verify.user as { role?: string })?.role ?? "?"}`);
}

async function tenantToken(slug: string, email: string, password: string) {
  const res = await post("/auth/tenant/login", { tenantSlug: slug, email, password });
  if (!res.accessToken)
    throw new Error(`Login tenant falló (¿2FA activo?): ${JSON.stringify(res)}`);
  const user = res.user as { permissions?: string[]; isOwner?: boolean };
  console.log(`TOKEN=${res.accessToken}`);
  console.log(`OWNER=${user?.isOwner}`);
  console.log(`PERMS=${JSON.stringify(user?.permissions)}`);
}

async function setTenantPass(slug: string, email: string, newPass: string) {
  const client = getTenantClient(slug);
  const u = await client.usuario.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`No existe el usuario ${email} en ${slug}`);
  await client.usuario.update({
    where: { id: u.id },
    data: { passwordHash: await argon2Hash(newPass), isActive: true },
  });
  console.log(`OK=contraseña de ${email} (${slug}) fijada a "${newPass}"`);
}

const mode = process.argv[2];
try {
  if (mode === "super") await superToken();
  else if (mode === "code") console.log(`CODE=${await superCode()}`);
  else if (mode === "tenant") {
    const [slug, email, pass] = process.argv.slice(3);
    if (!slug || !email || !pass)
      throw new Error("uso: dev-tokens tenant <slug> <email> <password>");
    await tenantToken(slug, email, pass);
  } else if (mode === "setpass") {
    const [slug, email, pass] = process.argv.slice(3);
    if (!slug || !email || !pass)
      throw new Error("uso: dev-tokens setpass <slug> <email> <newpass>");
    await setTenantPass(slug, email, pass);
  } else throw new Error("uso: dev-tokens super | code | tenant <...> | setpass <...>");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
await masterPrisma.$disconnect();
