# Corrección de build v10.18 — TemplateManager

El build de Cloudflare se detenía en `tsc --noEmit` por tres errores TS2352 en `features/templates/components/TemplateManager.tsx`.

## Causa

`BudgetTemplateConfig` es una unión de configuraciones con estructuras distintas. La versión anterior convertía directamente esa unión a `Record<string, unknown>` y luego de vuelta a `BudgetTemplateConfig`. TypeScript 5.8 en modo estricto rechaza esos casts porque las interfaces no tienen firma de índice y no existe superposición suficiente entre todos los miembros de la unión.

## Corrección

- Se eliminó el cast directo de `BudgetTemplateConfig` a `Record<string, unknown>`.
- La mezcla de configuración se realiza con `Object.assign({}, current.config, patch)`, que conserva el tipo unión base y permite agregar el parche dinámico sin el cast TS2352.
- Para la lectura genérica de campos en `ItemConfig`, se crea un registro mediante `Object.fromEntries(Object.entries(item.config))`.
- Se agregó una validación para evitar operar si el índice no devuelve un elemento.

No se modifican D1, migraciones, Prisma, autenticación, exportaciones ni reglas financieras.

La versión continúa siendo `v10.18 / 1.0.28-d1-web`, ya que el despliegue anterior no alcanzó producción.
