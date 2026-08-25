# Hotfix v11.0.1 — coherencia de pruebas del relato financiero

Versión técnica: `1.1.1-d1-web`.

Este hotfix corrige exclusivamente la coherencia entre el relato v10.31/v11 y dos pruebas unitarias heredadas que todavía exigían el título antiguo `Análisis financiero y principales consideraciones`.

El título vigente es `Análisis económico-financiero de la cohorte`.

Además, `source:audit` valida desde esta versión que ambos tests utilicen el título vigente, de modo que un despliegue parcial se detecte antes de ejecutar Vitest.

No modifica D1, migraciones, fórmulas presupuestarias, datos ni `wrangler.jsonc`.
