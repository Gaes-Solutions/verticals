# ADR 027 — Revisión antes de importar productos

- **Fecha:** 2026-09-14
- **Estado:** Aceptada (Gaby, 14-sep)

## Contexto

Los negocios que llegan de otro punto de venta suben su inventario exportado.
El primero real (Globoland, 2,050 productos) traía lo típico: códigos repetidos,
código y nombre volteados, nombres con basura ("PRECIO CAJA $132"), productos que
se venden por debajo del costo, existencias como 0.01 y 270 departamentos con
repetidos por mayúsculas, plurales y errores de dedo.

La carga masiva importaba todo tal cual: el mismo código en dos filas hacía que
la última pisara a la primera en silencio, un código de barras de otro producto
reventaba la fila con un error técnico y cada variante de departamento se volvía
una categoría nueva. Revisarlo a mano fila por fila no escala.

## Decisión

Referencia: la vista previa de importación de Shopify y la revisión de artículos
de Square — primero se ve qué va a pasar, luego se importa.

1. **Revisión en seco en el servidor** — `POST /t/productos/bulk/revisar` no guarda
   nada y devuelve problemas por fila, sugerencias de departamentos y la
   comparación con el catálogo (nuevos, a actualizar). Vive en el servidor
   porque necesita el catálogo real y así la regla es una sola para cualquier app.
2. **Dos severidades.**
   - *Bloqueante* (no se puede importar): dato obligatorio faltante, valor
     inválido, código repetido en el archivo, un código de barras en productos
     distintos o que ya usa otro producto del catálogo.
   - *Aviso* (se confirma): código y nombre invertidos, nombre sospechoso, precio
     menor al costo, existencia con decimales, cambio de precio de 50 % o más.
3. **Departamentos sin adivinar de más.** Mayúsculas/acentos/espacios se unen
   solos (con la categoría existente si la hay); singular/plural y palabras como
   "de" se sugieren marcadas; un posible error de dedo (una letra, 7+ letras,
   mismos números) se sugiere sin marcar. Los números distintos nunca se unen:
   "GLOBO 18" y "GLOBO 10" son productos distintos. Un departamento que es solo
   un número se señala para que el usuario lo asigne.
4. **La importación vuelve a validar la integridad.** `POST /t/productos/bulk`
   responde 422 con los problemas si hay códigos repetidos o de otro producto,
   aunque alguien se salte la revisión.
5. **Al final, el usuario ve qué se subió y qué no**, con el motivo de cada fila
   que no entró (quitada en la revisión o rechazada al guardar) y puede
   descargarlo.

## Consecuencias

- Las decisiones del usuario (unir, quitar, cambiar código, confirmar) viven en
  el panel hasta importar; si recarga la página, vuelve a revisar el archivo.
- Las filas se identifican por su posición en el arreglo enviado; el panel guarda
  la fila original del Excel para mostrarla.
- Detectar no corrige nada por su cuenta: toda corrección pasa por el usuario,
  salvo unir departamentos que solo difieren en mayúsculas o acentos.
