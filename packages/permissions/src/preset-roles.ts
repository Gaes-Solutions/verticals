import { PERMISSIONS, type PermissionCode } from "./catalog.js";

/**
 * Roles preset sembrados en cada tenant nuevo (editables por el dueño).
 * Referencia: docs/analisis/04-modelo-datos/4.6-usuarios-sucursales.md
 *
 * Subset Hito 1 retail/abarrotes. Los presets de salud (medico/enfermera/
 * recepcion) se siembran cuando el tenant activa esa vertical (Hito 3).
 *
 * El permiso `*` (wildcard) significa "todos los permisos actuales y futuros":
 * útil para el rol `dueno` para que adquiera permisos nuevos sin migration.
 */
export interface PresetRole {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisos: PermissionCode[] | ["*"];
}

const P = PERMISSIONS;

export const PRESET_ROLES_RETAIL: ReadonlyArray<PresetRole> = Object.freeze([
  {
    codigo: "dueno",
    nombre: "Dueño",
    descripcion: "Acceso total al tenant (no incluye billing SaaS, eso es del Superadmin)",
    permisos: ["*"],
  },
  {
    codigo: "gerente",
    nombre: "Gerente",
    descripcion: "Operación completa de la sucursal: cajas, ventas, inventario, reportes",
    permisos: [
      P.POS_USAR,
      P.VENTAS_LEER,
      P.VENTAS_CREAR,
      P.VENTAS_CANCELAR,
      P.VENTAS_DEVOLVER,
      P.VENTAS_COTIZAR,
      P.VENTAS_APLICAR_DESCUENTO,
      P.VENTAS_APLICAR_DESCUENTO_ALTO,
      P.PRODUCTOS_LEER,
      P.PRODUCTOS_CREAR,
      P.PRODUCTOS_ACTUALIZAR,
      P.PRODUCTOS_ARCHIVAR,
      P.PRODUCTOS_BULK_IMPORT,
      P.INVENTARIO_LEER,
      P.INVENTARIO_AJUSTAR,
      P.INVENTARIO_TRANSFERIR,
      P.PRECIOS_LEER,
      P.PRECIOS_MODIFICAR,
      P.PRECIOS_REGLA_CREAR,
      P.CLIENTES_LEER,
      P.CLIENTES_CREAR,
      P.CLIENTES_ACTUALIZAR,
      P.CLIENTES_FIADO_GESTIONAR,
      P.CAJA_ABRIR,
      P.CAJA_CERRAR,
      P.CAJA_CERRAR_FORZOSO,
      P.CAJA_MOVIMIENTO_CREAR,
      P.CORTE_CONSULTAR,
      P.CORTE_IMPRIMIR,
      P.CFDI_LEER,
      P.CFDI_EMITIR,
      P.CFDI_CANCELAR,
      P.REPORTES_VENTAS,
      P.REPORTES_INVENTARIO,
      P.REPORTES_FINANCIEROS,
      P.USUARIOS_LEER,
      P.USUARIOS_CREAR,
      P.USUARIOS_ACTUALIZAR,
      P.USUARIOS_ARCHIVAR,
      P.USUARIOS_ASIGNAR_ROL,
      P.USUARIOS_RESET_PASSWORD,
      P.ROLES_LEER,
      P.SUCURSALES_LEER,
      P.SUCURSALES_ACTUALIZAR,
      P.CAJAS_LEER,
      P.CAJAS_CREAR,
      P.CAJAS_ACTUALIZAR,
      P.CAJAS_ARCHIVAR,
      P.CONFIGURACION_LEER,
    ],
  },
  {
    codigo: "cajero",
    nombre: "Cajero",
    descripcion: "Operar POS, cobrar y manejar su caja",
    permisos: [
      P.POS_USAR,
      P.VENTAS_LEER,
      P.VENTAS_CREAR,
      P.VENTAS_APLICAR_DESCUENTO,
      P.PRODUCTOS_LEER,
      P.INVENTARIO_LEER,
      P.PRECIOS_LEER,
      P.CLIENTES_LEER,
      P.CAJA_ABRIR,
      P.CAJA_CERRAR,
      P.CAJA_MOVIMIENTO_CREAR,
      P.CORTE_CONSULTAR,
      P.CORTE_IMPRIMIR,
      P.CFDI_EMITIR,
    ],
  },
  {
    codigo: "vendedor",
    nombre: "Vendedor",
    descripcion: "Cajero + cotizaciones + alta de clientes + comisiones propias",
    permisos: [
      P.POS_USAR,
      P.VENTAS_LEER,
      P.VENTAS_CREAR,
      P.VENTAS_COTIZAR,
      P.VENTAS_APLICAR_DESCUENTO,
      P.PRODUCTOS_LEER,
      P.INVENTARIO_LEER,
      P.PRECIOS_LEER,
      P.CLIENTES_LEER,
      P.CLIENTES_CREAR,
      P.CLIENTES_ACTUALIZAR,
      P.CAJA_ABRIR,
      P.CAJA_CERRAR,
      P.CAJA_MOVIMIENTO_CREAR,
      P.CORTE_CONSULTAR,
      P.CORTE_IMPRIMIR,
      P.CFDI_EMITIR,
    ],
  },
  {
    codigo: "almacen",
    nombre: "Almacén",
    descripcion: "Inventario, recepciones y transferencias entre sucursales",
    permisos: [
      P.PRODUCTOS_LEER,
      P.PRODUCTOS_CREAR,
      P.PRODUCTOS_ACTUALIZAR,
      P.PRODUCTOS_BULK_IMPORT,
      P.INVENTARIO_LEER,
      P.INVENTARIO_AJUSTAR,
      P.INVENTARIO_TRANSFERIR,
      P.PRECIOS_LEER,
      P.REPORTES_INVENTARIO,
    ],
  },
  {
    codigo: "contador_interno",
    nombre: "Contador interno",
    descripcion: "Reportes financieros y emisión CFDI; sin acceso a POS",
    permisos: [
      P.VENTAS_LEER,
      P.PRODUCTOS_LEER,
      P.CLIENTES_LEER,
      P.CFDI_LEER,
      P.CFDI_EMITIR,
      P.CFDI_CANCELAR,
      P.REPORTES_VENTAS,
      P.REPORTES_INVENTARIO,
      P.REPORTES_FINANCIEROS,
    ],
  },
]);
