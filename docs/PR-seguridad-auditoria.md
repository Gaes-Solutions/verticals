# 🔐 Auditoría de seguridad — hacker ético multi-agente

Resultado de una auditoría automatizada (8 pentesters especializados → verificación adversarial → panel de 3 ingenieros + juez por mayoría → aplicación con typecheck y documentación). **~65 hallazgos** revisados; los reales, arreglados y documentados en [`docs/security-audit.md`](docs/security-audit.md).

## Resumen por severidad
| Severidad | Cantidad |
|---|---|
| 🔴 CRITICAL | 1 |
| 🟠 HIGH | 28 |
| 🟡 MEDIUM | 25 |
| ⚪ LOW | 11 |

## Lo más grave (arreglado)
- 🔴 **CRÍTICA** — Admin no-superadmin (soporte/billing) podía tomar control de **cualquier tenant** vía `/tenants` (escalada de privilegios cross-tenant).
- **Toma de cuenta del dueño** vía reset-password (un gerente reseteaba la contraseña del dueño).
- **Bypass de cobro**: proveedor de pago `mock` activo en producción → pedidos "pagados" sin cobro real.
- **Secuestro de subdominio** de tienda entre tenants.
- **Lectura de expediente clínico de otra clínica** (PHR cross-tenant).
- **SSRF** en URL de proveedor de recargas / verificación de dominios.
- **Webhook de pago no idempotente** → ventas dobles + inventario descontado dos veces.
- **Doble canje** de gift-card / puntos de lealtad y **sobregiro de monedero** (condiciones de carrera / TOCTOU).
- **Replay de passkey** (challenge WebAuthn nunca consumido).
- Sync `/push` **saltaba validación y RBAC** de creación de ventas/clientes.
- **TOTP reutilizable** (2FA sin single-use) en tenant/superadmin/partner.

## ⚠️ MIGRACIONES obligatorias antes de desplegar
Correr **antes** de subir el código (si no, endpoints de 2FA/consentimiento/dominio dan 500):

**Master** (`prisma migrate deploy` sobre la DB master):
- `20260727000000_add_webauthn_used_challenges`
- `20260728000000_add_consent_granted_via`
- `20260728010000_add_admin_mfa_last_step`
- `20260728120000_add_tienda_dominio_token`
- `20260728130000_add_paciente_master_otp_intentos`
- `20260728140000_add_partner_mfa_last_step`

**Tenant** (aplicar a **TODOS** los schemas por-tenant, no solo a uno):
- `20260729000000_add_usuario_mfa_last_step_single_use`

> Ya se eliminó una migración duplicada (`add_admin_mfa_last_step` repetida) que habría roto el deploy.

## Estado
- ✅ Rebasada sobre `main` actual (incluye el manual ilustrado). Sin conflictos.
- ✅ typecheck de los 26 paquetes en verde (api, db, web-admin incluidos).
- ⚠️ La suite de tests no corrió en runtime por falta de `DATABASE_URL_MASTER` en el entorno de la auditoría — conviene correrla en CI antes de mergear.

## Recomendación de merge
1. Revisar el diff (o al menos las entradas CRITICAL/HIGH en `docs/security-audit.md`).
2. Correr las migraciones (master + todos los tenants).
3. Merge a `main` → deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
