# Automatización de incidentes, auditoría y ejecución

El API registra cada error 5xx en `system_incidents` (base master), agrupa ocurrencias por huella y conserva un evento por aparición. El contexto se redacta antes de persistirlo: tokens, cookies, contraseñas, secretos y claves API nunca se envían a la IA ni al correo.

El scheduler `INCIDENT_AUDITOR_ENABLED=true` revisa las filas pendientes cada `INCIDENT_AUDITOR_INTERVAL_MIN`. Claude/Anthropic o el fallback local generan una propuesta con causa, pruebas y riesgo. La propuesta se guarda como evento y siempre marca `autoFixAllowed=false`.

Un superadmin revisa desde `/admin/incidents`. La aprobación queda en `system_incident_events` y en el `AuditLog`. El executor solo puede continuar mediante un handoff revisable; no se ejecutan comandos arbitrarios, no se editan archivos de producción y no se despliega código desde la respuesta del modelo. Esto evita convertir una alerta manipulada en ejecución remota.

Cuando exista un runner autenticado de Codex o Kimi, el proceso opcional `pnpm --filter @gaespos/api incident:agent` toma un incidente aprobado (`AGENT_RUNNER_ENABLED=true`), trabaja en un worktree aislado y registra su salida como `agent_execution`. La salida siempre queda pendiente de revisión; el runner no hace push, deploy ni migraciones automáticamente.

Para activar correo configura `RESEND_API_KEY`, `EMAIL_REMITENTE` e `INCIDENT_ALERT_EMAIL`. Si Resend falla, el incidente queda sin `lastNotifiedAt` y el siguiente ciclo vuelve a intentarlo. Aplica la migración `20260929090000_system_incidents` antes de activar el scheduler.
