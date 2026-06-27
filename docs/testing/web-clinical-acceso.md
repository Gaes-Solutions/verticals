# web-clinical — acceso para probar (vertical veterinaria)

App clínica/veterinaria. Puerto **5177** (registrada en `scripts/dev.sh`).

## Datos demo

Sembrados en el tenant `clinica-vet-patitas` (vertical salud_vet) con:

```bash
pnpm dotenv -e .env -- pnpm --filter @gaespos/db seed:vet-demo clinica-vet-patitas
```

Crea: médico + recepción + 3 mascotas (Max, Luna, Rocky) con tutor + una cita de hoy.

## Credenciales

| Rol | Negocio (slug) | Correo | Contraseña |
|-----|----------------|--------|------------|
| Médico | `clinica-vet-patitas` | `medico@vetdemo.gaessoft.local` | `Clinica!2026` |
| Recepción | `clinica-vet-patitas` | `recepcion@vetdemo.gaessoft.local` | `Clinica!2026` |

> La vertical salud **fuerza 2FA**: en el primer login la app muestra el QR para dar de
> alta el autenticador (Google Authenticator/Authy). Escanéalo una vez y guarda los
> códigos de respaldo.

## Cómo levantarla

```bash
./scripts/dev.sh up    # incluye web-clinical en :5177
# o solo la app:
pnpm --filter @gaespos/web-clinical dev
```

Luego abre `http://localhost:5177` y entra con las credenciales de arriba.

## Qué verás por rol

- **Médico:** Agenda del día, Expedientes, Consulta SOAP (firma), Recetas (COFEPRIS + imprimir),
  Hospitalización, Cartilla.
- **Recepción:** Agenda del día (check-in/transiciones), Expedientes, Hospitalización (camas/alta),
  Cartilla. (No ve SOAP ni emisión de recetas — gateado por permiso.)

## Verificación hecha (smoke API como médico)

Login + alta de 2FA + token, y luego los endpoints que consume la app:

| Endpoint | Resultado |
|----------|-----------|
| `GET /t/sucursales` | 200 (1) |
| `GET /t/mascotas` | 200 (3) |
| `GET /t/citas` (hoy) | 200 (1) |
| `GET /t/vacunaciones/catalogo` | 200 (12) |
| `GET /t/consultas/diagnosticos/catalogo?vertical=vet` | 200 (25) |

**Bug encontrado y corregido en esta verificación:** los roles preset de salud
(`medico`/`enfermera`/`recepcion`) no tenían `sucursales.leer`, y las pantallas SOAP/
Receta/Hospitalización lo necesitan para resolver el `sucursalId` → daban 403. Se agregó
`sucursales.leer` a los tres presets (y se parchearon los roles del tenant demo existente).
