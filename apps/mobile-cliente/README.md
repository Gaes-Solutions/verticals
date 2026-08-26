# GaesSoft Tienda (app móvil — cliente)

App nativa (Expo / React Native) para el **cliente/comprador** de una tienda GaesSoft:
consulta sus pedidos y su estado, recibe avisos y administra su cuenta. Consume el API
del backend (`/auth/cliente/*` y `/cliente-portal/*`) a través de `@gaespos/api-client`.

## Desarrollo

```bash
pnpm --filter @gaespos/mobile-cliente start   # Expo dev server (Expo Go / dev build)
```

La URL del API se resuelve así: `EXPO_PUBLIC_API_URL` → `extra.apiUrl` → `https://app.angaes.com/api`.

## Build (EAS)

```bash
# APK instalable directo (perfil preview)
pnpm --filter @gaespos/mobile-cliente exec eas build -p android --profile preview

# iOS (requiere cuenta Apple Developer)
pnpm --filter @gaespos/mobile-cliente exec eas build -p ios --profile preview
```

> Antes del primer build hay que crear/vincular el proyecto EAS y fijar `extra.eas.projectId`
> en `app.config.ts` (igual que en `mobile-negocio`).

## Seguridad

- Token en almacenamiento seguro del sistema (Keychain iOS / Keystore Android) vía `expo-secure-store`.
- Biometría opcional (`expo-local-authentication`) para desbloquear la sesión guardada.
- Ante un 401 la sesión se cierra automáticamente.
