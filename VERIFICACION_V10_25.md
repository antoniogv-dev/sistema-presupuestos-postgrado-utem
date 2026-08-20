# Verificación v10.25 — exportación XLSX institucional

La validación se realiza contra la planilla institucional entregada `2027 - Magíster en Metodologias BIM.xlsx`.

## Controles incorporados
1. Cinco hojas y nombres idénticos al modelo.
2. `styles.xml` y tema Excel idénticos byte a byte.
3. Estructura XML externa a las celdas idéntica por hoja, conservando anchos, alturas, merges, impresión y vistas.
4. Fórmulas de ingresos, matrícula, aranceles, docencia, staff, overhead, totales, flujo, arrastre y saldo acumulado.
5. Referencias absolutas con `$` protegidas frente al reemplazo JavaScript.
6. Valores cacheados conciliados contra `calculateBudget`.
7. Eliminación del `calcChain` anterior y recálculo completo al abrir Excel.
8. Fallback a exportación trazable cuando la geometría del modelo de dos años no representa el presupuesto sin pérdida de información.
