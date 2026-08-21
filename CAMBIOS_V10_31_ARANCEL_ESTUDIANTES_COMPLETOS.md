# Cambios v10.31 — Arancel anual por estudiantes completos

## Problema corregido
El motor heredaba una regla de 0,5 arancel por semestre activo. En un programa cuyo segundo año contiene un solo semestre, esa regla representaba 11 estudiantes como 5,5 estudiantes-año y el XLSX mostraba grupos de 0,5 / 2,5 / 2,5 estudiantes.

## Nueva regla
- El arancel es anual y se cobra una sola vez por cada año calendario en que la cohorte está activa.
- El período de cargo es el primer semestre activo de cada año.
- Los estudiantes se mantienen como personas completas.
- Los descuentos se aplican una sola vez al arancel anual del año.
- Las matrículas equivalentes pueden seguir siendo decimales porque representan equivalencia financiera, no cantidad física de personas.

## Caso de regresión
Con arancel anual de $3.937.500, 11 estudiantes, 5 con 20 % de descuento y 5 con 30 %:
- Arancel bruto anual: $43.312.500.
- Descuentos: $9.843.750.
- Arancel después de beneficios: $33.468.750.
- Matrículas equivalentes: 8,5.

El resultado es el mismo en 2027 y 2028 aunque 2028 tenga un solo semestre activo.

## XLSX institucional
`Flujo estudiantes` deja de mostrar estudiantes fraccionados. Para el caso anterior, ambos años muestran:
- Sin descuento: 1.
- Descuento 20 %: 5.
- Descuento 30 %: 5.
- Estudiantes totales: 11.
- Matrículas equivalentes: 8,5.

No hay migración D1 nueva.
