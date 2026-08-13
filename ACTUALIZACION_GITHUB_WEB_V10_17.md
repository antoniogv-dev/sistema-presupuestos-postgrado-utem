# Actualización v10.17 - Corrección XLSX para Microsoft Excel

Versión: `1.0.27-d1-web` / `v10.17`.

Esta versión corrige el archivo XLSX que Microsoft Excel estaba abriendo mediante reparación de las partes `xl/worksheets/sheet*.xml`, lo que provocaba que sólo quedara visible el flujo y que los parámetros aparecieran vacíos.

## Aplicación

1. Suba el paquete acumulativo v10.17 sobre el repositorio actual.
2. No reemplace `wrangler.jsonc`.
3. Confirme en `package.json` la versión `1.0.27-d1-web`.
4. Haga commit y espere el build/deploy de Cloudflare.
5. Verifique `/api/version`: debe informar `v10.17`.
6. Descargue un XLSX nuevo; los archivos antiguos no se reparan automáticamente.

No hay migraciones D1 nuevas.
