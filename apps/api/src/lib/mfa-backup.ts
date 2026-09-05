import { randomBytes } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * Códigos de respaldo (recovery codes) para 2FA: se generan al activar el MFA,
 * se muestran al usuario UNA vez y se guardan hasheados (argon2). Sirven para
 * entrar si el usuario pierde su autenticador. Cada código es de un solo uso.
 */
const DEFAULT_COUNT = 10;

/** Genera N códigos en claro con formato `xxxx-xxxx` (a–z 0–9). */
export function generateBackupCodes(count = DEFAULT_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").slice(0, 8); // 8 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/** Normaliza para comparar: sin guiones/espacios, minúsculas. */
function normalize(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => argon2Hash(normalize(c))));
}

/**
 * Verifica un código contra la lista de hashes. Si acierta, devuelve la lista
 * sin el hash consumido (de un solo uso) y `matchedHash`, el hash acertado, que
 * el caller DEBE usar como guarda en un `updateMany` condicional
 * (`mfaBackupCodes: { has: matchedHash }`) para que el consumo sea atómico bajo
 * concurrencia (evita TOCTOU: dos verify simultáneos con el mismo código). Si no
 * acierta, devuelve la lista intacta sin `matchedHash`.
 */
export async function consumeBackupCode(
  hashedCodes: string[],
  code: string,
): Promise<{ ok: boolean; remaining: string[]; matchedHash?: string }> {
  const candidate = normalize(code);
  if (!candidate) return { ok: false, remaining: hashedCodes };
  for (let i = 0; i < hashedCodes.length; i++) {
    const h = hashedCodes[i];
    if (!h) continue;
    let matches = false;
    try {
      matches = await argon2Verify(h, candidate);
    } catch {
      matches = false;
    }
    if (matches) {
      const remaining = hashedCodes.filter((_, idx) => idx !== i);
      return { ok: true, remaining, matchedHash: h };
    }
  }
  return { ok: false, remaining: hashedCodes };
}
