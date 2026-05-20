/**
 * Catálogo tipado de permisos del producto.
 * Backend valida `requirePermission('ventas.crear')` (NO `requireRole('cajero')`).
 * Frontend usa el mismo enum via `usePermission()`.
 *
 * Convención: `<dominio>.<accion>[.<scope>]` en snake_case.
 * Agregar entradas aquí cuando un endpoint nuevo necesite gate.
 *
 * Referencia: docs/analisis/04-modelo-datos/4.6-usuarios-sucursales.md
 */
export const PERMISSIONS = {
  POS_USAR: "pos.usar",

  VENTAS_LEER: "ventas.leer",
  VENTAS_CREAR: "ventas.crear",
  VENTAS_CANCELAR: "ventas.cancelar",
  VENTAS_DEVOLVER: "ventas.devolver",
  VENTAS_COTIZAR: "ventas.cotizar",
  VENTAS_APLICAR_DESCUENTO: "ventas.aplicar_descuento",
  VENTAS_APLICAR_DESCUENTO_ALTO: "ventas.aplicar_descuento_alto",

  PRODUCTOS_LEER: "productos.leer",
  PRODUCTOS_CREAR: "productos.crear",
  PRODUCTOS_ACTUALIZAR: "productos.actualizar",
  PRODUCTOS_ARCHIVAR: "productos.archivar",
  PRODUCTOS_BULK_IMPORT: "productos.bulk_import",

  INVENTARIO_LEER: "inventario.leer",
  INVENTARIO_AJUSTAR: "inventario.ajustar",
  INVENTARIO_TRANSFERIR: "inventario.transferir",

  PRECIOS_LEER: "precios.leer",
  PRECIOS_MODIFICAR: "precios.modificar",
  PRECIOS_REGLA_CREAR: "precios.regla_crear",

  CLIENTES_LEER: "clientes.leer",
  CLIENTES_CREAR: "clientes.crear",
  CLIENTES_ACTUALIZAR: "clientes.actualizar",
  CLIENTES_FIADO_GESTIONAR: "clientes.fiado_gestionar",

  CAJA_ABRIR: "caja.abrir",
  CAJA_CERRAR: "caja.cerrar",
  CAJA_CERRAR_FORZOSO: "caja.cerrar_forzoso",
  CAJA_MOVIMIENTO_CREAR: "caja.movimiento_crear",
  CORTE_CONSULTAR: "corte.consultar",
  CORTE_IMPRIMIR: "corte.imprimir",

  CFDI_LEER: "cfdi.leer",
  CFDI_EMITIR: "cfdi.emitir",
  CFDI_CANCELAR: "cfdi.cancelar",
  CFDI_CONFIGURAR: "cfdi.configurar",

  REPORTES_VENTAS: "reportes.ventas",
  REPORTES_INVENTARIO: "reportes.inventario",
  REPORTES_FINANCIEROS: "reportes.financieros",

  USUARIOS_LEER: "usuarios.leer",
  USUARIOS_CREAR: "usuarios.crear",
  USUARIOS_ACTUALIZAR: "usuarios.actualizar",
  USUARIOS_ARCHIVAR: "usuarios.archivar",
  USUARIOS_ASIGNAR_ROL: "usuarios.asignar_rol",
  USUARIOS_RESET_PASSWORD: "usuarios.reset_password",

  ROLES_LEER: "roles.leer",
  ROLES_CREAR: "roles.crear",
  ROLES_ACTUALIZAR: "roles.actualizar",
  ROLES_ARCHIVAR: "roles.archivar",

  SUCURSALES_LEER: "sucursales.leer",
  SUCURSALES_CREAR: "sucursales.crear",
  SUCURSALES_ACTUALIZAR: "sucursales.actualizar",
  SUCURSALES_ARCHIVAR: "sucursales.archivar",

  CAJAS_LEER: "cajas.leer",
  CAJAS_CREAR: "cajas.crear",
  CAJAS_ACTUALIZAR: "cajas.actualizar",
  CAJAS_ARCHIVAR: "cajas.archivar",

  CONFIGURACION_LEER: "configuracion.leer",
  CONFIGURACION_ACTUALIZAR: "configuracion.actualizar",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: ReadonlyArray<PermissionCode> = Object.freeze(
  Object.values(PERMISSIONS) as PermissionCode[],
);

export interface PermissionMeta {
  code: PermissionCode;
  category: string;
  description: string;
}

const META: Record<PermissionCode, Omit<PermissionMeta, "code">> = {
  "pos.usar": { category: "pos", description: "Acceder a la pantalla POS y operar el cajero" },

  "ventas.leer": { category: "ventas", description: "Consultar ventas" },
  "ventas.crear": { category: "ventas", description: "Crear ventas y cobrar" },
  "ventas.cancelar": { category: "ventas", description: "Cancelar ventas" },
  "ventas.devolver": { category: "ventas", description: "Procesar devoluciones" },
  "ventas.cotizar": { category: "ventas", description: "Crear cotizaciones B2B" },
  "ventas.aplicar_descuento": {
    category: "ventas",
    description: "Aplicar descuento manual dentro del límite del rol",
  },
  "ventas.aplicar_descuento_alto": {
    category: "ventas",
    description: "Aplicar descuento manual por encima del límite default",
  },

  "productos.leer": { category: "productos", description: "Consultar productos y catálogo" },
  "productos.crear": { category: "productos", description: "Crear productos" },
  "productos.actualizar": { category: "productos", description: "Editar productos" },
  "productos.archivar": { category: "productos", description: "Archivar productos" },
  "productos.bulk_import": { category: "productos", description: "Importar CSV de productos" },

  "inventario.leer": { category: "inventario", description: "Consultar stock por sucursal" },
  "inventario.ajustar": { category: "inventario", description: "Ajustar stock con motivo" },
  "inventario.transferir": {
    category: "inventario",
    description: "Transferir stock entre sucursales",
  },

  "precios.leer": { category: "precios", description: "Consultar listas y reglas de precios" },
  "precios.modificar": { category: "precios", description: "Modificar precios y listas" },
  "precios.regla_crear": { category: "precios", description: "Crear reglas y promociones" },

  "clientes.leer": { category: "clientes", description: "Consultar clientes" },
  "clientes.crear": { category: "clientes", description: "Crear clientes" },
  "clientes.actualizar": { category: "clientes", description: "Editar clientes" },
  "clientes.fiado_gestionar": {
    category: "clientes",
    description: "Gestionar fiados informales (abonos, límites)",
  },

  "caja.abrir": { category: "caja", description: "Abrir turno de caja con fondo" },
  "caja.cerrar": { category: "caja", description: "Cerrar turno de caja propio" },
  "caja.cerrar_forzoso": {
    category: "caja",
    description: "Cerrar turno de caja de otro usuario (gerente)",
  },
  "caja.movimiento_crear": {
    category: "caja",
    description: "Registrar retiros, depósitos y gastos manuales",
  },
  "corte.consultar": { category: "caja", description: "Consultar corte X" },
  "corte.imprimir": { category: "caja", description: "Imprimir reporte de corte" },

  "cfdi.leer": { category: "cfdi", description: "Consultar CFDIs emitidos" },
  "cfdi.emitir": { category: "cfdi", description: "Emitir CFDIs desde ventas" },
  "cfdi.cancelar": { category: "cfdi", description: "Cancelar CFDIs" },
  "cfdi.configurar": { category: "cfdi", description: "Configurar emisor CFDI y PAC" },

  "reportes.ventas": { category: "reportes", description: "Ver reportes de ventas" },
  "reportes.inventario": { category: "reportes", description: "Ver reportes de inventario" },
  "reportes.financieros": { category: "reportes", description: "Ver reportes financieros" },

  "usuarios.leer": { category: "usuarios", description: "Listar usuarios del tenant" },
  "usuarios.crear": { category: "usuarios", description: "Crear usuarios" },
  "usuarios.actualizar": { category: "usuarios", description: "Editar usuarios" },
  "usuarios.archivar": { category: "usuarios", description: "Archivar usuarios" },
  "usuarios.asignar_rol": { category: "usuarios", description: "Asignar/quitar roles a usuarios" },
  "usuarios.reset_password": {
    category: "usuarios",
    description: "Resetear contraseña de otros usuarios",
  },

  "roles.leer": { category: "roles", description: "Listar roles" },
  "roles.crear": { category: "roles", description: "Crear roles custom" },
  "roles.actualizar": { category: "roles", description: "Editar roles custom (presets read-only)" },
  "roles.archivar": { category: "roles", description: "Archivar roles custom" },

  "sucursales.leer": { category: "sucursales", description: "Listar sucursales" },
  "sucursales.crear": { category: "sucursales", description: "Crear sucursales" },
  "sucursales.actualizar": { category: "sucursales", description: "Editar sucursales" },
  "sucursales.archivar": { category: "sucursales", description: "Archivar sucursales" },

  "cajas.leer": { category: "cajas", description: "Listar cajas" },
  "cajas.crear": { category: "cajas", description: "Crear cajas" },
  "cajas.actualizar": { category: "cajas", description: "Editar cajas" },
  "cajas.archivar": { category: "cajas", description: "Archivar cajas" },

  "configuracion.leer": { category: "configuracion", description: "Ver configuración del tenant" },
  "configuracion.actualizar": {
    category: "configuracion",
    description: "Editar configuración del tenant",
  },
};

export function permissionMeta(code: PermissionCode): PermissionMeta {
  return { code, ...META[code] };
}

export function listPermissionsByCategory(): Record<string, PermissionMeta[]> {
  const grouped: Record<string, PermissionMeta[]> = {};
  for (const code of ALL_PERMISSIONS) {
    const meta = permissionMeta(code);
    const bucket = grouped[meta.category];
    if (bucket) {
      bucket.push(meta);
    } else {
      grouped[meta.category] = [meta];
    }
  }
  return grouped;
}

export function isKnownPermission(value: string): value is PermissionCode {
  return (ALL_PERMISSIONS as ReadonlyArray<string>).includes(value);
}
