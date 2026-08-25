# Corrección final de build v11.0 — pruebas del relato financiero

## Causa
Después de corregir `lib/export/financial-narrative.ts` y `lib/export/report-model.ts`, el código productivo y las pruebas documentales v10.31 quedaron correctamente actualizados. Sin embargo, dos pruebas unitarias antiguas seguían buscando el encabezado previo:

`Análisis financiero y principales consideraciones`

La implementación vigente v10.31 utiliza correctamente:

`Análisis económico-financiero de la cohorte`

Por eso Vitest detenía el build aun cuando el PDF y el relato generado correspondían a la versión nueva.

## Archivos corregidos
- `tests/unit/export-parameters.test.ts`
- `tests/unit/v1018-features.test.ts`

## Aplicación
Copie el contenido del ZIP en la raíz del repositorio y reemplace ambos archivos. No modifica `wrangler.jsonc`, Prisma, migraciones ni datos D1.

Después, vuelva a desplegar normalmente desde Cloudflare.
