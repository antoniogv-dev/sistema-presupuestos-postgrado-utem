# Cambios v10.19 — Consolidado institucional y proyección desde valor base

Versión: `1.0.29-d1-web`  
Release: `v10.19`

## 1. Consolidado institucional por estado

Se reemplaza el consolidado institucional único por dos vistas independientes:

- **Consolidado institucional · Aprobados**: incorpora sólo presupuestos con estado `Aprobado`.
- **Consolidado institucional · Activos**: incorpora `En revisión`, `Observado` y `Aprobado`.

Quedan excluidos expresamente de ambos cálculos:

- `Borrador`;
- `Reemplazado`;
- presupuestos eliminados lógicamente.

Las vistas de programas académicos, programas profesionales y consolidado por programa también se construyen con el conjunto activo, por lo que un borrador no altera los ingresos, egresos, duplicidades o resultado neto consolidado.

## 2. Proyección manual desde un valor base

Toda fila `PARAMETRO_ANUAL` de una plantilla, incluida una fila creada originalmente por la plataforma, incorpora:

- **Año base**;
- **Valor base manual**;
- **Reajuste anual (%)**;
- botón **Proyectar reajuste desde valor base**.

Ejemplo:

- Asistencia de dirección inicial: `$2.000.000`;
- nuevo valor base manual: `$3.000.000`;
- año base: `2027`;
- reajuste anual: `5 %`.

La proyección resultante será:

- 2027: `$3.000.000`;
- 2028: `$3.150.000`;
- 2029: `$3.307.500`;
- 2030: `$3.472.875`.

Si el usuario modifica directamente el valor del año que está seleccionado como año base, la plataforma sincroniza ese valor con `Valor base manual`, para que el botón proyecte desde el monto recién ingresado.

## 3. Compatibilidad

No se requiere nueva migración D1. `baseYear` y `baseValue` son opcionales dentro del JSON existente de configuración de la fila de plantilla. Las plantillas anteriores se siguen leyendo y, cuando esos campos no existen, se utiliza como base la primera anualidad positiva disponible.
