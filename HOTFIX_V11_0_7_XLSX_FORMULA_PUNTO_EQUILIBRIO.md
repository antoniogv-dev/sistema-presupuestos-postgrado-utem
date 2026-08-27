# Hotfix v11.0.7 — Fórmula de punto de equilibrio en XLSX

Versión técnica: `1.1.7-d1-web`.

## Mejora

El XLSX institucional de Magísteres Profesionales ya no exporta el punto de equilibrio como un valor fijo. La celda **Punto de equilibrio** contiene una fórmula Excel recalculable y la fila **Estudiantes a arancel completo** queda vinculada mediante `ROUNDUP`.

La fórmula considera:

- arancel anual por cada ciclo cobrado;
- incobrabilidad particular del presupuesto;
- overhead central y de facultad;
- reconocimiento de matrícula;
- ingresos fijos, incluido financiamiento institucional;
- arrastre autorizado;
- costos fijos del flujo;
- guía de tesis por tramos según estudiantes en graduación.

Se conserva un valor cacheado conciliado con el motor financiero, pero Excel recalcula automáticamente al abrir el archivo.

## Base de cálculo

La lógica corresponde al mismo escenario de matrículas equivalentes utilizado por `calculateBreakEvenEquivalentEnrollments`: neutraliza descuentos y becas de arancel para expresar el umbral en equivalentes a arancel completo, manteniendo la estructura de costos, arrastre e ingresos no arancelarios del presupuesto.

## Despliegue

No requiere migración D1 ni cambios en `wrangler.jsonc`.
