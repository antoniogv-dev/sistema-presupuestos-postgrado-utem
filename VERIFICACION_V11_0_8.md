# Verificación v11.0.8 — Punto de equilibrio de estudiantes

Versión técnica: `1.1.8-d1-web`.

## Fórmula institucional

Para el formato base de dos descuentos, la celda de punto de equilibrio contiene literalmente:

`=ABS('FLUJO TOTAL'!B37-'FLUJO TOTAL'!B36)/(Parámetros!$B$4*(1-Parámetros!$B$12)*(1-Parámetros!$B$13-Parámetros!$B$14))`

La fila siguiente utiliza:

`=ROUNDUP(B14,0)`

Cuando existen más descuentos, las filas de incobrabilidad y overhead se desplazan y las referencias se ajustan automáticamente.

## Criterio financiero

- Numerador: costos fijos del primer año, excluyendo overhead variable.
- Denominador: arancel anual neto de incobrabilidad y overhead.
- Descuentos: determinan las matrículas equivalentes observadas; no se vuelven a restar del umbral.
- Matrícula administrativa/reconocida: no reduce el umbral de este indicador.
- Financiamiento institucional, otros ingresos y arrastre: no reducen el umbral de este indicador.

## Caso de control solicitado

Se construyó un caso de prueba con la misma estructura algebraica y se obtuvo:

- Punto de equilibrio exacto: `9,449999913...` matrículas equivalentes.
- Punto de equilibrio mostrado: `9,45` matrículas equivalentes.
- Mínimo entero: `10` estudiantes a arancel completo.
- XLSX: B14 conserva la fórmula; B15 conserva `ROUNDUP(B14,0)`.

## Pruebas ejecutadas

- Compilación estricta del motor: correcta.
- Pruebas Node de motor, XLSX institucional, malla, formularios y documentos: `37/37` correctas.
- Preflight: correcto, 12 migraciones D1 verificadas.
- Source audit: correcto.
- Auditoría transversal: `12/12` controles correctos.
- Aplicación simulada del hotfix sobre v11.0.7 corregida: correcta.

No se incorpora una nueva migración D1 y no se modifica `wrangler.jsonc`.
