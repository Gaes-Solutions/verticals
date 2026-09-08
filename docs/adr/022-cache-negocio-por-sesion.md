# ADR 022 — Caché móvil Negocio por sesión

La caché de consultas no puede sobrevivir al cambio de cuenta ni de tenant. El proveedor de consultas y su árbol se recrean al cambiar estado de autenticación, usuario o tenant; la caché anterior se cancela y elimina. Las respuestas tardías pertenecen al cliente anterior y no se muestran en la sesión nueva. No se persisten datos comerciales en almacenamiento del dispositivo.

La restauración consulta `/auth/tenant/me` y valida tenant, identidad y permisos antes de habilitar el panel. Errores transitorios bloquean con reintento sin borrar credenciales; identidad inválida elimina la sesión. Operaciones tardías no reactivan una cuenta cerrada. Esto no acredita paridad de caja.
