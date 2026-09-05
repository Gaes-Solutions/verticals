import { verify as argon2Verify } from "@node-rs/argon2";

// Hash argon2id señuelo de un valor aleatorio, generado con los MISMOS parámetros
// por defecto de @node-rs/argon2 (m=19456,t=2,p=1) que usa el resto del código al
// hashear contraseñas. Verificar contra él consume el mismo tiempo de CPU que una
// verificación real, de modo que un login de cuenta inexistente/inactiva tarda lo
// mismo que uno de cuenta real: cierra el oráculo de enumeración por canal de timing.
const DECOY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$vRX9mfkdmPpCEUVk3KjymQ$GzWEa4m4E/C/H0yv7aEfQgdiSAgJwrEQdV9Pl8FpvW0";

/**
 * Consume el mismo tiempo que una verificación argon2id real sin revelar si la
 * cuenta existe. Invocar en las rutas de login cuando el usuario no existe o está
 * inactivo, ANTES de responder 401.
 */
export async function burnPasswordTiming(plaintext: string): Promise<void> {
  try {
    await argon2Verify(DECOY_HASH, plaintext);
  } catch {
    // Resultado irrelevante: solo interesa igualar el costo de CPU.
  }
}
