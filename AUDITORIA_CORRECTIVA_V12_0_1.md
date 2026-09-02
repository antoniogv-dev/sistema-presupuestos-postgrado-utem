# Auditoría correctiva v12.0.1

Versión técnica: `2.0.1-d1-web`.

## Hallazgos corregidos

1. **Normalización duplicada de costos manuales compartidos.** En v12.0.0 un costo manual de categorías como Software o Gastos operacionales podía quedar incluido simultáneamente en la normalización automática y en la normalización manual. v12.0.1 separa ambas bases y conserva una sola imputación.
2. **Periodicidad en costos compartidos.** La consolidación manual usaba el monto unitario del registro. Ahora utiliza el monto efectivo anual considerando periodicidad Única, Semestral o Anual.
3. **Validación sólo cliente para distribución personalizada.** La interfaz ya bloqueaba guardar cuando la distribución no sumaba 100 %, pero la API podía recibir una solicitud directa inválida. Se incorporó validación server-side compartida.
4. **KPI de presupuestos activos.** Se alineó al mismo conjunto de estados del consolidado activo: En revisión, Observado y Aprobado; los borradores no se cuentan.
5. **Contraste de badges en modo claro.** Se corrigió el color neutral para mantener legibilidad.

## Hallazgos no críticos

- Se eliminó una validación duplicada de porcentaje de economía de escala en el motor.
- No se detectaron errores de sintaxis en los 88 archivos TypeScript/TSX auditados.
- No se requiere migración D1 nueva; v12.0.1 utiliza las 13 migraciones existentes.
