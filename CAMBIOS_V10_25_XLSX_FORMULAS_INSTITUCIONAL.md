# Cambios v10.25 — XLSX institucional con fórmulas

Versión `1.0.35-d1-web` · release `v10.25`.

## Objetivo
La exportación XLSX de presupuestos de Magíster Profesional compatibles reproduce la planilla institucional `2027 - Magíster en Metodologias BIM.xlsx`: mismas cinco hojas, estilos, tema, tamaños, combinaciones, estructura de impresión y lógica de fórmulas, alimentadas desde el presupuesto activo.

## Alcance
Se usa el formato institucional cuando el presupuesto:
- corresponde a un Magíster Profesional;
- tiene exactamente dos años presupuestarios visibles;
- utiliza como máximo dos tasas distintas de descuento de arancel.

Los casos que exceden la estructura física de la planilla modelo mantienen la exportación general trazable para no perder información.

## Implementación
- Plantilla oficial copiada sin modificaciones a `public/templates/presupuesto-profesional-formula-base.xlsx`.
- Generador OOXML: `lib/export/institutional-budget-xlsx.ts`.
- Integración en `downloadBudgetXlsx`.
- Nombre de archivo institucional: `AÑO - Nombre del programa.xlsx`.
- Se eliminan `calcChain` obsoletos y Excel queda configurado para recálculo automático completo al abrir.
- Los valores cacheados de cada fórmula se escriben desde el motor financiero, de modo que la vista previa siga siendo coherente antes del recálculo de Excel.

## Protección de calidad
`npm run test:institutional-xlsx` comprueba automáticamente:
- identidad binaria de estilos y tema con la plantilla;
- identidad de la estructura de cada hoja fuera de `sheetData`;
- existencia de las cinco hojas originales;
- fórmulas clave y referencias absolutas intactas;
- ausencia de referencias de error dentro de las fórmulas;
- conciliación de ingresos, egresos, flujo y saldo acumulado con el motor financiero;
- recálculo automático forzado en Excel.
