# Actualización v10.15 - XLSX con parámetros visibles y PDF A4 vertical completo

## Archivo recomendado

Use el paquete incremental acumulativo v10.15 sobre el repositorio actualmente desplegado. No reemplace `wrangler.jsonc`.

## Cambios que deben verse después del deploy

1. `/api/version` debe devolver `v10.15` y `1.0.25-d1-web`.
2. Al exportar XLSX, la primera pestaña debe llamarse **Presupuesto completo**.
3. En esa misma primera pestaña, después del flujo, debe aparecer el bloque **PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO**.
4. El XLSX debe tener además las pestañas: Flujo presupuestario, Parámetros completos, Parámetros anuales, Parámetros semestrales, Descuentos y Costos e ingresos.
5. El PDF debe ser vertical en todas sus páginas: portada, flujo y parámetros.

## No requiere migración D1

No se agrega una migración. Se conservan las migraciones 0001 a 0007.
