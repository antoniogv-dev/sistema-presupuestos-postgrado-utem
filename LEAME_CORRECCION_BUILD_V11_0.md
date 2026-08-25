# Corrección de build v11.0

Este parche corrige el fallo de `source:audit` observado al aplicar la actualización incremental v11.0 sobre una base v10.32.

## Causa
La actualización v11.0 incorporó un `scripts/source-audit.mjs` que valida las mejoras documentales de v10.31, pero el ZIP incremental original no incluía las versiones actualizadas de:

- `lib/export/financial-narrative.ts`
- `lib/export/report-model.ts`

Por eso Cloudflare encontraba el auditor nuevo junto con archivos antiguos y detenía el build.

## Aplicación
Copie el contenido de este ZIP sobre la raíz del repositorio, conservando las rutas y reemplazando los dos archivos existentes. No modifique `wrangler.jsonc` ni la base D1.

Después ejecute el despliegue normal de Cloudflare.
