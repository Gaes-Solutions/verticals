# Decisiones pendientes

> **Cómo usar:** cuando surge una pregunta mid-código que NO está cubierta por los análisis 1-10 ni los ADRs, NO improvisar. Apuntar aquí, seguir con lo que sí está claro, y traer la duda en el siguiente check con Gaby.
>
> Cuando se resuelve una entrada:
> - Si es decisión arquitectónica → mover a un ADR en `docs/adr/`
> - Si es de scope/producto → actualizar el análisis correspondiente en `docs/analisis/`
> - Si es operativa puntual → marcar resuelto aquí + nota
>
> Formato por entrada: contexto · pregunta · opciones · default sugerido · estado.

## 🟡 Abiertas

*Vacío al iniciar Hito 0. Las dudas se irán acumulando aquí.*

## ✅ Resueltas

*Vacío al iniciar.*

---

## Plantilla nueva entrada

```markdown
### [YYYY-MM-DD] Título corto de la duda

- **Contexto**: cuándo/dónde surgió esta duda mientras se codeaba.
- **Pregunta**: ¿qué necesito decidir?
- **Opciones**:
  - A) ...
  - B) ...
  - C) ...
- **Default sugerido**: B (razón corta).
- **Bloqueante?**: Sí/No (¿impide avanzar?).
- **Estado**: 🟡 abierta · ✅ resuelta el YYYY-MM-DD por Gaby (eligió X)
```
