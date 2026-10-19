## APK de pruebas de Gaesland

Estos APK usan staging, separado de producción. Cliente v16 abre Gaesland directamente; kiosco v4 se vincula con el token del panel de pruebas.

### Cómo probar

1. Instala el APK cliente y abre la tienda. Comprueba que la carga termina, que ves imágenes y precios, y que puedes abrir y ampliar un producto.
2. Abre **Filtrar y ordenar**: combina categoría, precio, ofertas, disponibles y orden. Aplica, busca un producto, vuelve a abrir y cancela una edición; la selección aplicada debe conservarse. **Quitar filtros** conserva la búsqueda y vuelve a la primera página. Un rango de precios invertido muestra un aviso y permite corregirlo.
3. Agrega productos con toque o deslizando. Confirma el contador y las cantidades del carrito; prueba quitar y volver a agregar.
4. Crea una cuenta de pruebas o inicia sesión. Revisa dirección, ubicación y carrito al volver a abrir la app. Comprueba también la misma cuenta en la [web de staging](https://web-tienda-staging.up.railway.app).
5. Revisa cuenta, cierre de sesión y recuperación de contraseña. Los envíos de correo dependen de la configuración del entorno.
6. Para el kiosco, genera un token de dispositivo desde el panel de staging y actívalo. Escanea un producto de prueba y comprueba precio, sonido y vibración; desactiva sonido y repite.

No uses tarjetas reales ni datos personales de clientes. Las pruebas automáticas de Android cubren filtros, catálogo e inicio de sesión como invitado, carrito y dirección con cuenta sintética y pantalla inicial del kiosco. Cámara física, sonido audible, vibración, biometría y permisos particulares de tu teléfono requieren comprobación en un dispositivo real. No se prueba un cobro real.

Fuente cliente: e448f21bc51798f1777a6735c3da12e66c045f17. Se conserva el kiosco v4 construido desde b12b7dab48c5a3e5fa78ef450f4c5ad1c9e62447: sus 56 archivos de runtime son idénticos en ambas revisiones. SHA256SUMS y source.json permiten verificar integridad y procedencia.
