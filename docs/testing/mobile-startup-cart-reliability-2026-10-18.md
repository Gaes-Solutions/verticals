# Tienda móvil y kiosko: arranque, carrito y errores

## Alcance de esta revisión

Revisión de código y pruebas locales de `mobile-cliente` y `mobile-kiosko`:
restauración de tienda/cuenta, aislamiento por propietario, lectura y sincronización
del carrito, cantidades, checkout e idempotencia, errores de cuenta, navegación,
direcciones, favoritos, avisos, perfil, pedidos y recuperación del kiosko ante
fallos de permisos/conexión/configuración. No equivale a una prueba física de cada
pantalla ni a una validación de pagos reales.

## Hallazgos corregidos

1. **Carga inicial sin salida si fallaba SecureStore al recuperar la tienda.**
   La lectura se ejecutaba antes de `restore` y sin capturar el rechazo. El estado
   de autenticación permanecía en `loading`. Ahora la lectura forma parte de la
   restauración protegida: distingue una lectura fallida de una sesión ausente,
   conserva las credenciales y muestra un mensaje con `Reintentar` en el arranque.
   La regresión simula rechazo de almacenamiento y recuperación posterior.
2. **Existencias verificadas con un carrito anterior al último toque.** La ficha
   y el catálogo podían aceptar dos adiciones consecutivas antes del siguiente
   render, excediendo el stock publicado. Ahora ambas acciones releen el carrito
   vivo antes de modificarlo y rechazan acciones de otro propietario. El cálculo
   también respeta el máximo acumulado de 100000 aunque el stock sea privado.
   Hay regresiones para adiciones consecutivas, cuenta anterior y límites.
3. **Enlace de producto malformado con carga permanente.** Un parámetro `slug`
   repetido podía convertirse en un arreglo: deshabilitaba la consulta pero
   mostraba `Loading`. Ahora se muestra la invitación a seleccionar un artículo.
4. **Importes inválidos presentados como gratis o truncados.** `parseFloat`
   aceptaba prefijos como `100oops`; otros valores se convertían en cero. Las dos
   apps muestran `Precio no disponible` para valores inválidos, nulos o no
   finitos. Los ceros reales y ajustes negativos siguen formateándose. Diez
   casos por app cubren esta regla.
5. **Cuenta y login sin límite de espera de red.** Carrito y checkout tenían
   plazo, pero algunas pantallas de cuenta y autenticación no. El transporte del
   cliente aplica un plazo de 12 segundos, conserva cancelaciones del llamador y
   retira el temporizador/listener al terminar. Fallar por conexión no cierra la
   sesión. Tres regresiones verifican login, cuenta y cancelación explícita.

## Validación

- `pnpm --filter @gaespos/mobile-cliente test`: **119/119**, 14 archivos.
- `pnpm --filter @gaespos/mobile-kiosko test`: **39/39**, 6 archivos.
- Typecheck local de ambas apps: **aprobado**.
- Export Metro Android de ambas apps: **aprobado**; salida local ignorada por Git
  en `apps/mobile-cliente/dist/audit-20261018` y
  `apps/mobile-kiosko/dist/audit-20261018`.
- Biome en archivos modificados: sin errores; advierte complejidad en funciones
  de pantalla/autenticación existentes.

## Límites y comprobaciones de dispositivo

No se enviaron pedidos, cobros, correos ni cambios de carritos de clientes reales.
No se creó un APK ni se publicó una actualización móvil en esta revisión. Los
rechazos de almacenamiento y red se inyectaron en pruebas; el error original de
la pantalla del usuario no se reprodujo en su teléfono. Deben comprobarse en un
APK actualizado: arranque con almacenamiento bloqueado/reintento, fuentes y
gestos, huella/Face ID, permisos de ubicación/cámara, lector físico, beep/vibración
y retorno de la pasarela en Android. Un bundle Metro válido no certifica esos
comportamientos físicos.
