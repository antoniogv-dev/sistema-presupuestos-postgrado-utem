# Hotfix v11.0.2 — XLSX institucional con malla curricular dinámica

Versión técnica: `1.1.2-d1-web`.

## Problema corregido

La exportación XLSX institucional estaba limitada a 13 asignaturas valorizables y 3 competencias genéricas por la cantidad fija de filas de la plantilla. Una malla con 14 asignaturas, como la observada en la formulación, quedaba bloqueada antes de generar el archivo.

## Solución

- La hoja `Costo Directo de Docencia` ahora inserta filas dinámicamente cuando la malla supera las 13 asignaturas valorizables.
- La sección de competencias genéricas también se amplía cuando supera 3 registros.
- Se conservan estilos, fórmulas, filas de subtotal, guía de tesis y referencias del `FLUJO TOTAL`.
- El subtotal de horas docentes se recalcula hasta la última asignatura real.
- El costo docente total sigue conciliando con el motor financiero.
- Se mantiene la plantilla institucional original para mallas de hasta 13 asignaturas, sin cambiar su estructura.
- Límites técnicos de seguridad: 120 asignaturas valorizables y 40 competencias genéricas.

No modifica D1, migraciones ni `wrangler.jsonc`.
