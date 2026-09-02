# Corrección de build v10.11 — BudgetWorkspace

## Error corregido

Cloudflare detenía `npm run typecheck` con:

- `TS18047: 'budget' is possibly 'null'`.
- `TS2345: Argument of type 'CohortBudget | null' is not assignable to parameter of type 'CohortBudget'`.

El problema estaba en `features/budgets/components/BudgetWorkspace.tsx`, dentro de `manualCostAmount()`. La función utilizaba `budget` sin estrechar previamente el tipo nullable y además lo capturaba dentro de un callback de `reduce`, donde TypeScript no podía garantizar que siguiera siendo no nulo.

## Corrección aplicada

La función ahora:

1. retorna `0` cuando no existe un presupuesto seleccionado;
2. guarda el presupuesto validado en `currentBudget`;
3. utiliza `currentBudget` dentro de `filter` y `reduce`.

No cambia fórmulas, base D1, migraciones, autenticación ni configuración Cloudflare.

## Cómo aplicar

Si ya subió la v10.11 y el build falló:

1. Reemplace únicamente `features/budgets/components/BudgetWorkspace.tsx` por el archivo incluido en este paquete.
2. Haga commit, por ejemplo: `fix: corrige nullability del flujo v10.11`.
3. Espere el nuevo build de Cloudflare.

La versión continúa siendo `1.0.21-d1-web / v10.11`, porque la v10.11 anterior no alcanzó a desplegarse.

## Verificación realizada

- Se reprodujeron exactamente las dos líneas señaladas por Cloudflare en el bloque afectado.
- Se aplicó estrechamiento explícito del tipo nullable.
- El patrón corregido fue compilado con TypeScript 5.8 en modo `strict` sin errores.
- `preflight` y `source:audit` pasan con una configuración temporal no productiva de Wrangler.
- Las 12 pruebas autónomas del motor financiero pasan.

La validación integral de Next.js + Prisma + OpenNext se realizará nuevamente en Cloudflare al ejecutar el nuevo build.
