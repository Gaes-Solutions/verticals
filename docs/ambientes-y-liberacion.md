# Ambientes de testing y producción

La separación se hace por rama, imágenes, secretos, bases de datos, Redis y
volúmenes. Nunca se debe reutilizar una credencial de producción en testing.

| Ambiente | Rama | Etiqueta de imágenes | Datos | Despliegue |
|---|---|---|---|---|
| Testing | `staging` | `staging` y `staging-<sha>` | Base y Redis exclusivos | `.github/workflows/staging.yml` |
| Producción | `main` | `latest` y `<sha>` | Base, Redis y volúmenes reales | `.github/workflows/main.yml` |

## Configurar testing

1. En GitHub crea el environment `staging` y configura ahí `COOLIFY_WEBHOOK_URL`
   y `COOLIFY_WEBHOOK_TOKEN` para el proyecto de testing.
2. En la máquina de testing crea `.env.staging` a partir de
   `.env.staging.example`, con una base, Redis, JWT y usuario administrador
   distintos a producción.
3. Levanta el stack con un nombre de proyecto separado:

   ```bash
   docker compose -p gaespos-staging \
     -f docker-compose.prod.yml -f docker-compose.staging.yml \
     --env-file .env.staging up -d
   ```

4. Ejecuta migraciones y revisa salud antes de probar:

   ```bash
   docker compose -p gaespos-staging -f docker-compose.prod.yml \
     --env-file .env.staging exec api pnpm gaes-migrate master
   curl -fsS http://localhost:3100/health
   ```

## Promover a producción

Solo se promueve un commit que haya pasado el flujo de PR y la verificación
manual de testing. Después del merge a `main`:

1. Confirma que el build de las cinco imágenes terminó en verde.
2. Revisa migraciones pendientes y toma un respaldo antes de aplicarlas.
3. Despliega las imágenes del SHA que aprobaste; `latest` solo es un alias.
4. Ejecuta smoke tests de `/health`, login, catálogo, carrito y checkout.
5. Si falla, vuelve al tag SHA anterior y restaura únicamente después de
   confirmar el incidente.

## Respaldos y restauración

`.github/workflows/respaldo-diario.yml` toma un `pg_dump` cifrado cada día,
valida el catálogo con `pg_restore --list` y conserva 14 días en GitHub Actions.
Los secretos requeridos son `DATABASE_PUBLIC_URL` y `BACKUP_PASSPHRASE`.

Para un ensayo local:

```bash
gpg --decrypt respaldo.dump.gpg > respaldo.dump
bash scripts/restore-ensayo.sh respaldo.dump
```

La restauración nunca se hace sobre producción como primer paso: primero se
valida el archivo en una base desechable y después se decide la recuperación.

## Revisión de rutas

- Las rutas administrativas están agrupadas con `authenticateAdmin`.
- Las rutas de tenant pasan por `tenant-context` y deben llamar a
  `req.requirePerm(...)` antes de leer o modificar datos.
- Las rutas públicas están bajo prefijos explícitos (`/public/...`) y no deben
  aceptar tokens administrativos.
- Los webhooks validan su firma y las rutas de billing solo cargan mocks en
  `development`/`test`.

Antes de cada liberación, revisar rutas nuevas con:

```bash
rg -n "app\.addHook\(|preHandler:|req\.requirePerm\(|/public/" apps/api/src
pnpm --filter @gaespos/api test
```

El despliegue de producción sigue bloqueado hasta corregir el error actual de
compilación de `web-pos` por los paquetes `@gaespos/pricing` y
`@gaespos/sync-client`; separar ambientes no debe ocultar ese fallo.
