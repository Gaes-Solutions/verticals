# Parches de dependencias

## decode-uri-component 0.2.2

El parche reemplaza el decoder recursivo por el algoritmo lineal oficial de 0.5.0,
conservando `module.exports` callable y la conversión de `+` a espacio propia de 0.2.2.
La procedencia e integridad del tarball upstream se registran en
`decode-uri-component-source.json`. Se conserva la licencia MIT del paquete original.

`query-string` 7.1.3 consume el módulo con `require()` y lo llama directamente;
0.5.0 es ESM y no es un reemplazo compatible en Metro sin otro cambio coordinado.
Por eso no se fuerza esa versión ni se desactiva el aviso de auditoría de 0.2.2.

Verificar la cadena instalada con:

```bash
node scripts/testing/check-mobile-uri-decode.cjs
```

Eliminar el parche solo al actualizar el consumidor a una versión que admita un
decoder corregido compatible, repetir pruebas adversariales y reconstruir el APK.

## image-size 1.2.1

Backport de límites de los parsers ICNS/JXL/HEIF de 2.0.3, preservando la función
CommonJS y el soporte de filename/buffer que exige Metro 0.82.5. La procedencia
se registra en `image-size-source.json`; se conserva la licencia del paquete.

```bash
node scripts/testing/check-mobile-image-size.cjs
```

ICNS/JXL malformados de apenas 24/32 bytes podían bloquear Metro incluso con
extensión PNG. No basta limitar peso/extensión. Las pruebas ejecutan esos casos
en procesos con timeout y comprueban PNG/SVG/ICNS/HEIF válidos. La auditoría por
versión sigue señalando 1.2.1; no se silencia ni se afirma que desapareció del registro.
