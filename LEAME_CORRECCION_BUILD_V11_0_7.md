# Corrección build v11.0.7 — FUNCTIONAL_RELEASE de Presupuestos

## Causa
El hotfix v11.0.7 original actualizó `scripts/source-audit.mjs` para exigir la marca funcional `v11.0.7`, pero omitió el archivo `features/budgets/components/BudgetWorkspace.tsx` del ZIP incremental.

Como consecuencia, al aplicar el hotfix sobre v11.0.6, Cloudflare encontraba:

- auditor: `FUNCTIONAL_RELEASE = "v11.0.7"`
- BudgetWorkspace: `FUNCTIONAL_RELEASE = "v11.0.6"`

El build se detenía en `source:audit` antes de ejecutar TypeScript y pruebas.

## Corrección
Se reemplaza exclusivamente `features/budgets/components/BudgetWorkspace.tsx`. La única diferencia respecto de v11.0.6 en ese archivo es:

`const FUNCTIONAL_RELEASE = "v11.0.7";`

No cambia fórmulas, D1, migraciones, datos, autenticación ni `wrangler.jsonc`.
