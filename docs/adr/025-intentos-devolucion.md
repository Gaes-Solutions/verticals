# ADR 025 — Intentos durables de devolución sin timbrado

Estado: aceptado para implementación local, septiembre 2026.

Una devolución parcial puede confirmarse y perder su respuesta. Reenviar con nueva identidad duplica stock y efectivo. Persistimos una clave UUID por usuario dentro del schema tenant, hash canónico y resultado en la misma transacción de devolución. El bloqueo de intento precede a apertura y venta. La consulta nunca interpreta ausencia como prueba de no envío. Cancelar un intento ausente guarda tombstone; un POST tardío con esa clave no muta. Confirmadas nunca se cancelan mediante este protocolo.

Compatibilidad: clave opcional en endpoint existente. Clave junto con cfdiEgreso se rechaza antes de mutar; el timbrado externo posterior a commit requiere otro protocolo y no se reintenta por replay. No se prometen entregas físicas de dinero ni exactly once de proveedores. El cliente conserva clave y payload antes de enviar y recupera por misma identidad. No se atribuyen devoluciones por similitud.
