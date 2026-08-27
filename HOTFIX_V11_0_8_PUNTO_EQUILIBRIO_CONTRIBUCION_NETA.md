# Hotfix v11.0.8 — Punto de equilibrio por contribución neta

Versión técnica: `1.1.8-d1-web`.

## Regla

El punto de equilibrio de programas profesionales se expresa en **matrículas equivalentes** y utiliza:

`Costos fijos / [Arancel anual × (1 - Incobrabilidad) × (1 - Overhead central - Overhead facultad)]`

En el XLSX institucional, cuando existen las dos filas base de descuentos, la fórmula es literalmente:

`=ABS('FLUJO TOTAL'!B37-'FLUJO TOTAL'!B36)/(Parámetros!$B$4*(1-Parámetros!$B$12)*(1-Parámetros!$B$13-Parámetros!$B$14))`

El mínimo entero de estudiantes a arancel completo se calcula con `=ROUNDUP(B14,0)`. Si existen más descuentos, las filas de incobrabilidad y overhead se desplazan y el exportador actualiza automáticamente las referencias.

## Criterios

- `FLUJO TOTAL!B37 - FLUJO TOTAL!B36` aísla los costos fijos, excluyendo overhead.
- Los descuentos no se restan nuevamente porque ya están representados en la conversión a matrículas equivalentes.
- La matrícula administrativa/reconocida, financiamiento institucional, otros ingresos y arrastre no reducen el umbral de este indicador.
- Cambios de costos, arancel, incobrabilidad u overhead actualizan automáticamente el cálculo.
- No se incorpora una nueva migración D1.
