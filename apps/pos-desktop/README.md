# GaesSoft POS de escritorio — estado de empaquetado

El proyecto contiene un shell Tauri 2 que carga la compilación de `apps/web-pos`.
**No hay un instalador certificado ni operación offline persistente terminada.**
La presencia del plugin SQL y de un archivo de migración no demuestra que SQLite
esté conectado a las ventas.

## Cambios de preparación — 2026-09-08

- Iconos de escritorio generados desde la marca GS ya utilizada en
  `apps/mobile-kiosko/assets/icon.png`, copiada en `assets/app-icon.png`.
  Se utilizó el generador oficial de la CLI Tauri local; no se creó otra marca.
- El arranque de desarrollo exige el puerto previsto con `--strictPort`, para
  fallar claramente si está ocupado en lugar de abrir otra aplicación.
- La ventana permite reducirse a 360 px de ancho para revisar el diseño estrecho.
- El empaquetado genérico utiliza los formatos del sistema anfitrión; los scripts
  Windows/macOS/Linux verifican el sistema antes de invocar Tauri.
- Comprobaciones previas explican herramientas ausentes y verifican iconos y
  concordancia de versión de Tauri/Cargo. No instalan nada ni certifican un build.

## Hallazgos que bloquean una entrega operable

1. **Destino de API:** el build oficial exige `GAESPOS_API_BASE` y la transmite
   a Vite como `VITE_POS_API_BASE`. El cliente web conserva `/api` como default
   para despliegue web; el instalador debe construirse con un destino HTTPS
   explícito. No basta configurar el proxy de desarrollo `VITE_API_URL`.
2. **CSP y CORS:** el build deriva `connect-src` del origen exacto elegido,
   conserva el resto de CSP y elimina otros destinos de conexión de la
   sobreescritura de producción. Falta comprobar CORS del backend con los
   orígenes nativos reales; esta configuración no los autoriza automáticamente.
3. **SQLite:** `main.rs` registra `tauri-plugin-sql`, pero no registra
   `migrations/001_sync_local.sql` mediante `add_migrations`. No hay adaptador
   `SqliteStorage` ni importación JS `@tauri-apps/plugin-sql` en el POS. El SQL
   documentado todavía no se ejecuta como migración de esta aplicación.
4. **Aislamiento local:** las tablas propuestas de cola/cache/meta no incluyen
   tienda, sucursal y usuario como ámbito. Diseñar una base/ámbito por cuenta y
   recuperación de pendientes antes de conectar el esquema a ventas reales.
5. **Permisos Tauri:** no existe una configuración explícita de capabilities
   para el uso JS de SQLite. Definir permisos mínimos junto al adaptador, sin
   conceder acceso SQL arbitrario a contenidos remotos.
6. **Reproducibilidad y hardware:** falta `Cargo.lock` producido por un build
   revisado, instaladores identificados por commit, firma/actualización probada
   y certificación de impresora, cajón, lector y contingencias por plataforma.

Estos puntos son diagnóstico, no una nueva decisión de arquitectura. La
selección de API/CORS/CSP y el diseño de almacenamiento deben resolverse en el
trabajo de integración correspondiente antes de publicar instaladores.

## Comandos de preparación

Desde la raíz del repositorio, con las dependencias JavaScript disponibles:

```bash
pnpm --filter @gaespos/pos-desktop check:assets
pnpm --filter @gaespos/pos-desktop check:native
pnpm --filter @gaespos/pos-desktop dev
# Definir antes GAESPOS_API_BASE con el destino HTTPS elegido.
pnpm --filter @gaespos/pos-desktop build
```

`check:native` revisa Rust/Cargo y, en Linux, pkg-config con WebKitGTK/OpenSSL.
Es un filtro inicial; otros paquetes del instalador también pueden ser necesarios.
El diagnóstico completo de la CLI se obtiene con:

```bash
pnpm --filter @gaespos/pos-desktop exec tauri info
```

Para distribución, configura `GAESPOS_API_BASE` en el entorno del proceso de
build (por ejemplo, el valor autorizado de la API del cliente/entorno). No se
proporciona un dominio default. Se rechazan URL relativas, HTTP, credenciales,
query, fragmentos y comodines. El script inyecta `VITE_POS_API_BASE` a todos los
subprocesos del build, incluido el `beforeBuildCommand` de Vite.

La CSP de distribución se pasa a Tauri en una sobreescritura temporal fuera del
repositorio y se limpia al terminar. Se preservan las demás directivas; el
`connect-src` queda limitado a `'self'` y al origen HTTPS explícito. No se
interpolan variables en un shell. No uses directamente `tauri build` para
saltar esta preparación. Ver [ADR 018](../../docs/adr/018-api-explicita-bundle-pos-escritorio.md).

Los scripts específicos se ejecutan en el sistema correspondiente:

```bash
pnpm --filter @gaespos/pos-desktop build:windows
pnpm --filter @gaespos/pos-desktop build:macos
pnpm --filter @gaespos/pos-desktop build:linux
```

Windows requiere las herramientas MSVC/WebView2; macOS requiere Xcode y los
objetivos Rust de Intel/Apple Silicon para el binario universal; Linux requiere
WebKitGTK y herramientas de compilación/empaquetado. Las claves de firma se
administran fuera del repositorio. No se han instalado aquí esos componentes.

## Secuencia de cierre

1. Elegir/configurar API del bundle y comprobar login, ventas y CORS/CSP con
   un entorno de pruebas aislado. Mantener bloqueada venta offline si todavía
   no está implementada y verificada.
2. Diseñar aislamiento local; registrar migraciones y capabilities mínimas,
   implementar el adaptador de almacenamiento y conectar sincronización.
3. Probar pérdida de red, reinicio, respuesta perdida, idempotencia, conflicto,
   cambio de cuenta y actualización sin perder pendientes.
4. Construir en matriz Windows/macOS/Linux, fijar dependencias Rust y asociar
   artefactos al commit. Firmar/notarizar según plataforma.
5. Instalar y actualizar en equipos reales; comprobar ventana estrecha,
   impresión/periféricos y recuperación antes de aprobar comercialización.

## Evidencia de esta revisión

- `check:assets`: correcto; todos los iconos declarados existen y las versiones
  Cargo/Tauri coinciden.
- La CLI Tauri lee la configuración actual sin error.
- `check:native`: bloqueado correctamente por ausencia de Rust/Cargo y
  WebKitGTK/OpenSSL detectables. `tauri info` también informa rsvg2 y rustup
  ausentes, además de bindings JS de SQL/Tauri no instalados.
- No se compiló Rust ni se produjo, instaló o firmó ningún instalador.
- 18 pruebas puras de URL/CSP/argumentos aprobadas (`pnpm --filter
  @gaespos/pos-desktop test`). Sin `GAESPOS_API_BASE`, build se detiene antes de
  invocar Tauri; con una URL válida todavía debe superar herramientas nativas.
- La CSP base del repositorio permanece; solo se genera sobreescritura acotada
  al construir. No se modificaron aquí el cliente API web ni producción.
