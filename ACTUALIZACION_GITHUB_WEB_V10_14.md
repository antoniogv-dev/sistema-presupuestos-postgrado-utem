# Actualización v10.14 - aplicación verificable de exportaciones y costos

Esta actualización es acumulativa sobre v10.13 y no modifica `wrangler.jsonc` ni crea una migración D1 nueva.

## Archivos que deben quedar reemplazados en GitHub

- `package.json`
- `app/api/version/route.ts`
- `app/globals.css`
- `app/importar-exportar/page.tsx`
- `components/AppShell.tsx`
- `features/budgets/components/BudgetWorkspace.tsx`
- `lib/export/download.ts`
- `lib/export/pdf.ts`
- `lib/export/report-model.ts`
- `lib/export/xlsx.ts`
- `public/Portada2026.jpg`
- `scripts/source-audit.mjs`
- `tests/unit/export-parameters.test.ts`

## Comprobación antes de esperar el build

En GitHub, abra `package.json` y confirme:

```json
"version": "1.0.24-d1-web"
```

Abra `features/budgets/components/BudgetWorkspace.tsx` y busque:

```text
Agregar costo al flujo
flow-remove-button
Costo: {item.name}
```

Abra `lib/export/xlsx.ts` y busque estas cinco hojas de parámetros:

```text
Parámetros completos
Parámetros anuales
Parámetros semestrales
Descuentos
Costos e ingresos
```

Si esas cadenas no están en GitHub, la actualización no quedó reemplazada aunque el ZIP haya sido descargado.

## Después del despliegue

`/api/version` debe devolver `v10.14` y `1.0.24-d1-web`.

En la barra lateral también debe mostrarse `v10.14`. En el flujo, cada costo manual debe aparecer como fila `Costo: ...` con botón `Quitar`.
