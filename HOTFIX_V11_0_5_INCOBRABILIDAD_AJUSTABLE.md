# Hotfix v11.0.5 — Incobrabilidad ajustable por presupuesto

Versión técnica: `1.1.5-d1-web`.

## Mejora

La incobrabilidad deja de ser exclusivamente un parámetro institucional fijo para el cálculo de cada cohorte. Desde esta versión:

- cada presupuesto puede definir su propio porcentaje de incobrabilidad entre 0% y 100%;
- los presupuestos nuevos parten con la referencia institucional del tipo de programa;
- los presupuestos históricos sin valor particular continúan usando automáticamente la referencia institucional;
- la incobrabilidad se aplica al arancel después de descuentos y beca interna de arancel;
- la matrícula reconocida y el financiamiento institucional permanecen fuera de esta base;
- al modificar la incobrabilidad se modifica automáticamente la base de overhead, porque ésta continúa siendo arancel bruto menos descuentos de arancel menos incobrabilidad;
- PDF, XLSX, memorándum y hoja de parámetros reflejan la tasa realmente utilizada en la formulación.

## Persistencia

Se incorpora la migración D1 `0012_budget_bad_debt_rate.sql`, que agrega el campo nullable `badDebtRate` a `CohortBudget`. El valor `NULL` significa “usar referencia institucional”, lo que mantiene compatibilidad con presupuestos existentes.
