# GaesSoft Negocio (app móvil — staff)

App nativa (Expo / React Native) para el equipo del negocio (dueño, gerente, cajero, vendedor).
Consume la API de GaesSoft (`https://app.angaes.com/api`) y adapta el menú por rol/permisos.

## Requisitos
- Node 20+, pnpm 10+ (ya están en el monorepo).
- Para probar en tu teléfono: la app **Expo Go** (Android/iOS).
- Para build de tienda: cuenta **Expo (EAS)** y, para iOS, **Apple Developer ($99/año)**.

## Correr en desarrollo
```bash
pnpm install                        # desde la raíz del monorepo (instala Expo)
pnpm --filter @gaespos/mobile-negocio start
# escanea el QR con Expo Go, o pulsa 'a' (Android) / 'i' (iOS con Mac)
```
Apunta a otra API con: `EXPO_PUBLIC_API_URL=https://tu-api/api pnpm --filter @gaespos/mobile-negocio start`

## Generar el APK (Android) y app iOS con EAS
```bash
npm i -g eas-cli
eas login
cd apps/mobile-negocio
eas build -p android --profile preview   # genera un .apk instalable
eas build -p ios --profile preview       # requiere cuenta Apple Developer
```
El `.apk`/`.ipa` queda para descargar desde el panel de EAS y subir a Play/App Store.

## Seguridad (Fase 1)
- Token en **Keychain (iOS) / Keystore (Android)** vía `expo-secure-store` (nunca en texto plano).
- **Huella / Face ID** (`expo-local-authentication`) para desbloquear la sesión guardada.
- 401 → cierra sesión y pide re-login (el backend no tiene refresh token todavía).
- **Pendiente Fase 2+ de seguridad**: certificate pinning, detección root/jailbreak, bloqueo de screenshot, refresh token en el backend.

## Estructura
- `src/config.ts` — URL del API y llaves de storage.
- `src/lib/storage.ts` — almacenamiento seguro (expo-secure-store).
- `src/lib/api.ts` — cliente cableado a `@gaespos/api-client`.
- `src/lib/auth-store.ts` — sesión, login, 2FA, biometría, logout (Zustand).
- `app/` — Expo Router: `login`, gate de sesión, y grupo `(app)` con tabs por rol.
