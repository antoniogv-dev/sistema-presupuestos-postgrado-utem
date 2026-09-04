# Verificación XLSX v13.0.3

Objetivo: impedir que un Magíster Profesional con `tuitionPricingMode = PROGRAM_TOTAL` sea derivado al XLSX general.

Cambios verificados por inspección de fuente:

- `downloadBudgetXlsx` mantiene el formato institucional para Magísteres Profesionales con arancel anual o arancel total, salvo descuentos directos sobre matrícula.
- `institutionalBudgetForExport` crea sólo una vista de compatibilidad para la plantilla; no modifica el presupuesto guardado ni el resultado financiero.
- En `PROGRAM_TOTAL`, cada año reproduce `programTotalTuition × tuitionDistributionShare` dentro de `Parámetros!fila 4`.
- Para una distribución semestral uniforme de un programa de cuatro semestres que inicia en 2S, el resultado anual es 25 % / 50 % / 25 %, equivalente al formato MEES aportado como referencia.
- Se conservan extensión multianual, normalización de matrícula, prorrateo de staff y corrección final de punto de equilibrio.
- Se agrega prueba unitaria de identidad entre la distribución anual del precio total y el arancel anual de compatibilidad usado sólo para exportación.
