# Respaldo, restauración y rollback

Criterio de salida del piloto: **respaldo automático + restauración probada + plan de rollback
ensayado**. Este documento cubre los tres, y el ensayo de restauración ya se hizo.

## Ensayo realizado (9-sep-2026)

| Paso | Resultado |
|---|---|
| Respaldo de producción | 740 KB en formato custom |
| Restauración en base desechable | correcta |
| Tablas restauradas | 208, igual que producción |
| Esquemas de tenant | 1 |
| Tenants y planes | 1 y 5 |

## El detalle que rompía el respaldo

**Producción corre Postgres 18.6 y el contenedor local es 16.11.** `pg_dump` se niega a leer un
servidor más nuevo que él:

```
pg_dump: error: aborting because of server version mismatch
```

Por eso los scripts usan la imagen `postgres:18-alpine` en Docker en lugar del cliente local.
Si algún día Railway actualiza la versión mayor, hay que subir esa etiqueta en los dos scripts.

## Respaldar

```bash
bash scripts/backup-prod.sh              # a ~/respaldos-gaespos
bash scripts/backup-prod.sh /otra/ruta   # o donde quieras
```

Genera un archivo en formato custom (`-Fc`): comprimido y restaurable selectivamente, tabla por
tabla si hace falta.

**El archivo contiene datos personales de clientes.** No lo subas a repositorios, ni a Drive
compartido, ni lo mandes por chat. Guárdalo cifrado o en un disco que controles.

## Ensayar la restauración

```bash
bash scripts/restore-ensayo.sh ~/respaldos-gaespos/gaespos-AAAAMMDD-HHMMSS.dump
```

Levanta un Postgres desechable, restaura ahí dentro, cuenta lo que llegó y se borra solo. Nunca
toca producción ni la base de desarrollo.

Un respaldo que nunca se restauró no es un respaldo. Ensáyalo al menos una vez al mes y siempre
antes de una migración grande.

## Restaurar de verdad en producción (emergencia)

Esto es destructivo y se hace solo con la aplicación detenida.

1. **Detén el servicio del API** en Railway para que nadie escriba durante la restauración.
2. **Respalda el estado actual antes de tocar nada**, aunque esté corrupto: es tu única vuelta
   atrás si la restauración sale peor.
3. Restaura con la imagen 18:
   ```bash
   URL="$(railway variables -s Postgres --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).DATABASE_PUBLIC_URL))')"
   docker run --rm -i -e PGURL="$URL" postgres:18-alpine \
     pg_restore --clean --if-exists --no-owner --no-privileges -d "$PGURL" < archivo.dump
   ```
4. Verifica con las mismas cuentas del ensayo antes de levantar el API.
5. Levanta el API y comprueba salud, login y una venta de prueba.

## Rollback de una versión de código

Railway despliega en cada push a `main`, así que el rollback es un push.

```bash
git revert <commit-malo>        # revierte sin reescribir historia
git push origin HEAD:main       # dispara el despliegue de vuelta
```

También puedes redesplegar una versión anterior desde el panel de Railway, que es más rápido
cuando la urgencia manda.

**El rollback de código NO deshace una migración de base de datos.** Por eso todas las
migraciones del proyecto son aditivas: la versión anterior del código ignora las tablas y
columnas nuevas y sigue funcionando. Nunca metas una migración que borre o renombre sin un plan
de dos pasos.

## Lo que falta confirmar en el panel de Railway

Desde la terminal no se puede ver si los respaldos automáticos del servicio Postgres están
encendidos. Hay que entrar al panel, servicio Postgres, sección de respaldos, y confirmar:

- que están activados,
- cada cuánto corren,
- cuántos días se conservan.

Los scripts de arriba son el respaldo que sí controlamos y que ya está probado. Los automáticos
de Railway son la segunda red, no la primera.
