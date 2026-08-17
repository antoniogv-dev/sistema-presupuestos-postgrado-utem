# Actualización v10.21 — Selección aislada de presupuestos

Versión: **v10.21 / 1.0.31-d1-web**

## Objetivo
Evitar que la selección o edición de un presupuesto altere el estado local de otros presupuestos del formulario.

## Cambios
- El selector superior queda como **filtro pendiente**.
- Cambiar la opción del selector no modifica la página inmediatamente.
- El botón **Aplicar filtro** carga expresamente el presupuesto elegido y cambia todo el formulario.
- El presupuesto activo se edita en un **borrador local aislado** (`draftBudget`); la colección de presupuestos cargada desde D1 permanece sin mutar.
- Si existen cambios sin guardar y se intenta cambiar de presupuesto, el sistema pide confirmación antes de descartarlos.
- El botón **Recargar activo** permite descartar cambios locales y volver a leer desde D1 el mismo presupuesto.
- Se muestra un bloque **Presupuesto activo** y un indicador **Cambios sin guardar**.
- Se advierte al abandonar la página si existen cambios locales sin guardar.
- El presupuesto activo queda reflejado en `?budget=<id>` de la URL.
- El cambio de Programa muestra una confirmación expresa de que sólo afectará al presupuesto activo.

## Archivos principales
- `features/budgets/components/BudgetWorkspace.tsx`
- `app/globals.css`
- `components/AppShell.tsx`
- `app/api/version/route.ts`
- `scripts/source-audit.mjs`
- `package.json`

No hay migración D1 nueva.
