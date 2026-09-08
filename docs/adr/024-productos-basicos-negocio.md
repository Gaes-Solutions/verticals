# ADR 024 — Productos básicos desde Negocio

El encargado puede crear productos unitarios de una variante y editar nombre, descripción y precio base de productos simples usando las rutas existentes. Permisos separados productos.leer/crear/actualizar. El alta captura IVA explícitamente y código de barras opcional; editar no cambia impuestos, SKU, inventario, publicación ni variantes complejas. Los campos fuera de este formulario no se envían.

Se verifica la respuesta por lectura y los errores conservan formulario. Fallos ambiguos requieren consultar antes de repetir. El PATCH backend debe guardar producto y variante de forma atómica. Sin migración ni nuevo stack. Pendientes: variantes avanzadas, imágenes, categorías/marcas, lotes/series/peso, modificaciones fiscales, publicación y certificación nativa. Esto no acredita paridad total.
