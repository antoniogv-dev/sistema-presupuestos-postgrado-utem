-- v11.0.5: incobrabilidad editable por presupuesto/cohorte.
-- NULL conserva compatibilidad con presupuestos históricos y utiliza la referencia institucional del tipo de programa.
ALTER TABLE "CohortBudget" ADD COLUMN "badDebtRate" DECIMAL;
