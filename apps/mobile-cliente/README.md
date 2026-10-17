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
# Gaesland de pruebas: tienda fija, API de staging y paquete separado
pnpm --filter @gaespos/mobile-cliente exec eas build -p android --profile gaesland-staging-phone

# App genérica: permite elegir tienda y usa el endpoint definido en preview
pnpm --filter @gaespos/mobile-cliente exec eas build -p android --profile preview

# iOS (requiere cuenta Apple Developer)
pnpm --filter @gaespos/mobile-cliente exec eas build -p ios --profile preview
```

El proyecto ya está vinculado en `extra.eas.projectId`. `gaesland-staging-phone`
genera una APK ARM para teléfonos; el paquete `com.gaessoft.cliente.staging`
puede coexistir con producción. No usar `preview` para validar Gaesland staging.

## Seguridad

- Token en almacenamiento seguro del sistema (Keychain iOS / Keystore Android) vía `expo-secure-store`.
- Biometría opcional (`expo-local-authentication`) para desbloquear la sesión guardada.
- Ante un 401 la sesión se cierra automáticamente.
- La app no requiere acceso a archivos compartidos ni permiso para dibujar sobre
  otras aplicaciones; esos permisos están bloqueados en la configuración Android.
