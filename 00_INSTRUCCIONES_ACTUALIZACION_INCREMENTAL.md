# Actualización incremental v12.1.1 → v12.1.2

Este paquete contiene todos los archivos que cambian entre la v12.1.1 verificada y la v12.1.2.

## Aplicación

1. Parta de un repositorio v12.1.1 o del repositorio parcialmente actualizado que produjo el error de `source:audit` del 03-09-2026.
2. Copie el contenido de este ZIP sobre la raíz del repositorio, conservando las carpetas.
3. Reemplace los archivos existentes cuando GitHub lo solicite.
4. No borre ni reemplace `wrangler.jsonc`, secrets ni variables productivas de Cloudflare.
5. Confirme que `package.json` diga `"version": "2.1.2-d1-web"`.
6. Confirme que `components/AppShell.tsx` muestre `v12.1.2` y `2.1.2-d1-web`.
7. Haga commit/push a `main` y deje que Cloudflare reconstruya.
8. No actualice Prisma a 8.x para esta corrección. La versión validada sigue siendo Prisma 6.19.0.
9. No hay una migración D1 nueva para v12.1.2.

## Archivos funcionales críticos incluidos

- package.json
- scripts/source-audit.mjs
- scripts/repository-completeness-audit.mjs
- components/AppShell.tsx
- features/budgets/components/BudgetWorkspace.tsx
- app/api/version/route.ts
- lib/calculations/break-even.ts
- lib/export/report-model.ts
- lib/export/institutional-budget-xlsx.ts
- demo/tests/institutional-xlsx.test.mjs
- demo/tests/break-even-v1212.test.mjs
- tests/unit/budget-engine.test.ts

Los demás archivos incluidos corresponden a documentación y trazabilidad de la release.
