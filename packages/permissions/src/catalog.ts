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

  APARTADOS_LEER: "apartados.leer",
  APARTADOS_CREAR: "apartados.crear",
  APARTADOS_ABONAR: "apartados.abonar",
  APARTADOS_LIQUIDAR: "apartados.liquidar",
  APARTADOS_CANCELAR: "apartados.cancelar",

  CXC_LEER: "cxc.leer",
  CXC_CREAR: "cxc.crear",
  CXC_COBRAR: "cxc.cobrar",
  CXC_CONDONAR: "cxc.condonar",

  COTIZACIONES_LEER: "cotizaciones.leer",
  COTIZACIONES_ENVIAR: "cotizaciones.enviar",
  COTIZACIONES_GESTIONAR_ESTADO: "cotizaciones.gestionar_estado",

  PEDIDOS_LEER: "pedidos.leer",
  PEDIDOS_CREAR: "pedidos.crear",
  PEDIDOS_APROBAR: "pedidos.aprobar",
  PEDIDOS_GESTIONAR: "pedidos.gestionar",
  PEDIDOS_CONVERTIR_VENTA: "pedidos.convertir_venta",

  RECARGAS_LEER: "recargas.leer",
  RECARGAS_VENDER: "recargas.vender",
  RECARGAS_REEMBOLSAR: "recargas.reembolsar",
  RECARGAS_CONFIGURAR: "recargas.configurar",

  PACIENTES_LEER: "pacientes.leer",
  PACIENTES_CREAR: "pacientes.crear",
  PACIENTES_ACTUALIZAR: "pacientes.actualizar",
  PACIENTES_ARCHIVAR: "pacientes.archivar",

  MEDICOS_LEER: "medicos.leer",
  MEDICOS_EDITAR_PERFIL: "medicos.editar_perfil",

  AGENDA_LEER: "agenda.leer",
  AGENDA_GESTIONAR: "agenda.gestionar",
  AGENDA_BLOQUEAR: "agenda.bloquear",

  CITAS_LEER: "citas.leer",
  CITAS_CREAR: "citas.crear",
  CITAS_GESTIONAR: "citas.gestionar",
  CITAS_CHECKIN: "citas.checkin",
  CITAS_CANCELAR: "citas.cancelar",

  CONSULTAS_LEER: "consultas.leer",
  CONSULTAS_CREAR: "consultas.crear",
  CONSULTAS_FIRMAR: "consultas.firmar",
  CONSULTAS_ENMENDAR: "consultas.enmendar",

  RECETAS_LEER: "recetas.leer",
  RECETAS_EMITIR: "recetas.emitir",
  RECETAS_CANCELAR: "recetas.cancelar",

  MASCOTAS_LEER: "mascotas.leer",
  MASCOTAS_CREAR: "mascotas.crear",
  MASCOTAS_ACTUALIZAR: "mascotas.actualizar",
  MASCOTAS_ARCHIVAR: "mascotas.archivar",

  VACUNAS_LEER: "vacunas.leer",
  VACUNAS_APLICAR: "vacunas.aplicar",
  VACUNAS_GESTIONAR_CARTILLA: "vacunas.gestionar_cartilla",

  CAMAS_LEER: "camas.leer",
  CAMAS_GESTIONAR: "camas.gestionar",

  HOSPITALIZACION_LEER: "hospitalizacion.leer",
  HOSPITALIZACION_CREAR: "hospitalizacion.crear",
  HOSPITALIZACION_ALTA: "hospitalizacion.alta",

  MEDICACION_PROGRAMAR: "medicacion.programar",

  KARDEX_LEER: "kardex.leer",
  KARDEX_APLICAR: "kardex.aplicar",
  KARDEX_REPROGRAMAR: "kardex.reprogramar",

  CFDIS_RECIBIDOS_LEER: "cfdis_recibidos.leer",
  CFDIS_RECIBIDOS_UPLOAD: "cfdis_recibidos.upload",
  CFDIS_RECIBIDOS_CATEGORIZAR: "cfdis_recibidos.categorizar",
  CFDIS_RECIBIDOS_CANCELAR: "cfdis_recibidos.cancelar",

  COMPRAS_OC_LEER: "compras_oc.leer",
  COMPRAS_OC_CREAR: "compras_oc.crear",
  COMPRAS_OC_AUTORIZAR: "compras_oc.autorizar",
  COMPRAS_OC_RECIBIR: "compras_oc.recibir",

  DIOT_GENERAR: "diot.generar",

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

  "apartados.leer": { category: "apartados", description: "Consultar apartados y sus abonos" },
  "apartados.crear": { category: "apartados", description: "Crear apartados (reserva stock)" },
  "apartados.abonar": { category: "apartados", description: "Registrar abonos a apartado" },
  "apartados.liquidar": {
    category: "apartados",
    description: "Liquidar apartado y convertir a venta",
  },
  "apartados.cancelar": {
    category: "apartados",
    description: "Cancelar apartado (libera stock + aplica pena)",
  },

  "cxc.leer": { category: "cxc", description: "Consultar cuentas por cobrar" },
  "cxc.crear": { category: "cxc", description: "Crear CxC manual o desde venta a crédito" },
  "cxc.cobrar": { category: "cxc", description: "Registrar pagos a cuentas por cobrar" },
  "cxc.condonar": { category: "cxc", description: "Condonar saldo de CxC (incobrable/perdón)" },

  "cotizaciones.leer": { category: "cotizaciones", description: "Consultar cotizaciones" },
  "cotizaciones.enviar": {
    category: "cotizaciones",
    description: "Enviar cotización al cliente (PDF + email/WhatsApp)",
  },
  "cotizaciones.gestionar_estado": {
    category: "cotizaciones",
    description: "Aceptar, rechazar o convertir cotizaciones a pedido",
  },

  "pedidos.leer": { category: "pedidos", description: "Consultar pedidos B2B" },
  "pedidos.crear": {
    category: "pedidos",
    description: "Crear pedidos B2B (directo o desde cotización)",
  },
  "pedidos.aprobar": {
    category: "pedidos",
    description: "Aprobar/rechazar pedidos B2B que requieren aprobación interna",
  },
  "pedidos.gestionar": {
    category: "pedidos",
    description: "Preparar/marcar enviado/entregado/cancelar pedidos",
  },
  "pedidos.convertir_venta": {
    category: "pedidos",
    description: "Convertir pedido entregado a venta cobrada",
  },

  "recargas.leer": { category: "recargas", description: "Consultar recargas y servicios cobrados" },
  "recargas.vender": {
    category: "recargas",
    description: "Procesar recargas tiempo aire y cobro de servicios",
  },
  "recargas.reembolsar": {
    category: "recargas",
    description: "Reembolsar recarga fallida/disputada y devolver saldo",
  },
  "recargas.configurar": {
    category: "recargas",
    description: "Configurar proveedor agregador (api_key + saldo alerta)",
  },

  "pacientes.leer": { category: "pacientes", description: "Consultar expedientes de pacientes" },
  "pacientes.crear": { category: "pacientes", description: "Crear paciente local" },
  "pacientes.actualizar": { category: "pacientes", description: "Editar datos del paciente" },
  "pacientes.archivar": { category: "pacientes", description: "Archivar paciente" },

  "medicos.leer": {
    category: "medicos",
    description: "Consultar perfil de médicos del consultorio",
  },
  "medicos.editar_perfil": {
    category: "medicos",
    description: "Editar perfil clínico (cédula, especialidades, firma)",
  },

  "agenda.leer": { category: "agenda", description: "Ver horarios y disponibilidad médica" },
  "agenda.gestionar": {
    category: "agenda",
    description: "Crear y editar horarios de atención",
  },
  "agenda.bloquear": {
    category: "agenda",
    description: "Bloquear agenda por vacaciones / incapacidad / cierre",
  },

  "citas.leer": { category: "citas", description: "Consultar citas" },
  "citas.crear": { category: "citas", description: "Agendar nueva cita" },
  "citas.gestionar": { category: "citas", description: "Reagendar / marcar inicio consulta" },
  "citas.checkin": {
    category: "citas",
    description: "Registrar llegada del paciente + signos vitales recepción",
  },
  "citas.cancelar": { category: "citas", description: "Cancelar citas" },

  "consultas.leer": { category: "consultas", description: "Consultar expediente SOAP" },
  "consultas.crear": { category: "consultas", description: "Iniciar consulta médica" },
  "consultas.firmar": {
    category: "consultas",
    description: "Firmar electrónicamente consulta (vuelve inmutable, NOM-024)",
  },
  "consultas.enmendar": {
    category: "consultas",
    description: "Crear enmienda a consulta firmada (nueva versión vinculada)",
  },

  "recetas.leer": { category: "recetas", description: "Consultar recetas emitidas" },
  "recetas.emitir": {
    category: "recetas",
    description: "Emitir receta médica con firma electrónica",
  },
  "recetas.cancelar": { category: "recetas", description: "Cancelar receta emitida" },

  "mascotas.leer": { category: "mascotas", description: "Consultar expedientes de mascotas (vet)" },
  "mascotas.crear": { category: "mascotas", description: "Registrar mascota nueva" },
  "mascotas.actualizar": { category: "mascotas", description: "Editar datos de la mascota" },
  "mascotas.archivar": {
    category: "mascotas",
    description: "Archivar mascota (defunción / inactividad)",
  },

  "vacunas.leer": {
    category: "vacunas",
    description: "Consultar cartilla de vacunación de paciente/mascota",
  },
  "vacunas.aplicar": {
    category: "vacunas",
    description: "Registrar aplicación de vacuna con lote y caducidad",
  },
  "vacunas.gestionar_cartilla": {
    category: "vacunas",
    description: "Editar/anular registros de cartilla",
  },

  "camas.leer": {
    category: "hospitalizacion",
    description: "Consultar camas y su estado",
  },
  "camas.gestionar": {
    category: "hospitalizacion",
    description: "Crear/editar camas y cambiar estado (limpieza, mantenimiento, fuera de servicio)",
  },

  "hospitalizacion.leer": {
    category: "hospitalizacion",
    description: "Consultar hospitalizaciones, signos vitales y cargos",
  },
  "hospitalizacion.crear": {
    category: "hospitalizacion",
    description: "Ingresar paciente/mascota a hospitalización",
  },
  "hospitalizacion.alta": {
    category: "hospitalizacion",
    description: "Dar de alta y generar venta con cargos acumulados",
  },

  "medicacion.programar": {
    category: "hospitalizacion",
    description: "Programar/suspender medicación intrahospitalaria",
  },

  "kardex.leer": {
    category: "hospitalizacion",
    description: "Consultar kardex de aplicaciones",
  },
  "kardex.aplicar": {
    category: "hospitalizacion",
    description: "Registrar aplicación u omisión de medicación programada",
  },
  "kardex.reprogramar": {
    category: "hospitalizacion",
    description: "Reprogramar dosis pendientes del kardex",
  },

  "cfdis_recibidos.leer": {
    category: "despacho",
    description: "Consultar CFDIs recibidos (XMLs de proveedores)",
  },
  "cfdis_recibidos.upload": {
    category: "despacho",
    description: "Subir XML/ZIP de CFDIs recibidos",
  },
  "cfdis_recibidos.categorizar": {
    category: "despacho",
    description: "Asignar/sobrescribir categoría contable a un CFDI recibido",
  },
  "cfdis_recibidos.cancelar": {
    category: "despacho",
    description: "Marcar CFDI recibido como cancelado (verificación PAC)",
  },

  "compras_oc.leer": {
    category: "compras",
    description: "Consultar órdenes de compra",
  },
  "compras_oc.crear": {
    category: "compras",
    description: "Crear orden de compra en borrador",
  },
  "compras_oc.autorizar": {
    category: "compras",
    description: "Autorizar orden de compra y enviarla a proveedor",
  },
  "compras_oc.recibir": {
    category: "compras",
    description: "Marcar recepción parcial o total + vincular CFDI recibido",
  },

  "diot.generar": {
    category: "despacho",
    description: "Generar archivo DIOT TXT formato SAT del periodo",
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
