import { masterPrisma } from "@gaespos/db";
// El proveedor de pago mock exige opt-in explícito fuera de producción (evita el
// bypass de cobro). La batería lo necesita para ejercer cobros y checkout.
process.env.PAGOS_ALLOW_MOCK = "true";
import { afterAll, beforeAll } from "vitest";
import {
  TEST_ADMIN_EMAIL,
  cleanupTestRefreshTokens,
  cleanupTestTenants,
  disconnectTenantPool,
} from "./helpers.js";

// Los tests comparten la DB de dev y los helpers fijan un secret TOTP de prueba
// sobre el admin sembrado. Para no romper el 2FA REAL de quien usa el panel,
// snapshot del estado MFA antes de la corrida y restauración al terminar.
let mfaSnapshot: {
  mfaSecret: string | null;
  mfaVerifiedAt: Date | null;
  mfaBackupCodes: string[];
} | null = null;

beforeAll(async () => {
  const admin = await masterPrisma.adminUser.findUnique({
    where: { email: TEST_ADMIN_EMAIL },
    select: { mfaSecret: true, mfaVerifiedAt: true, mfaBackupCodes: true },
  });
  mfaSnapshot = admin ?? null;
  await cleanupTestTenants();
  await cleanupTestRefreshTokens();
});

afterAll(async () => {
  if (mfaSnapshot) {
    await masterPrisma.adminUser
      .update({ where: { email: TEST_ADMIN_EMAIL }, data: mfaSnapshot })
      .catch(() => undefined);
  }
  await disconnectTenantPool();
  await cleanupTestTenants();
  await cleanupTestRefreshTokens();
  await masterPrisma.$disconnect();
});
