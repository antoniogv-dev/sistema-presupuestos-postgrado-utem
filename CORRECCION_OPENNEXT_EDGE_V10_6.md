# Corrección OpenNext Edge Runtime — v10.6

## Causa del fallo

El build de Next.js terminaba correctamente, pero OpenNext fallaba al generar el bundle porque `app/api/version/route.ts` declaraba:

```ts
export const runtime = "edge";
```

Con `@opennextjs/cloudflare`, la aplicación debe usar el runtime Node.js de Next.js. La ruta de versión no requiere Edge, por lo que v10.6 la fija explícitamente en `nodejs`.

## Cambios

- `app/api/version/route.ts`: `runtime = "nodejs"` y versión `1.0.16-d1-web` / release `v10.6`.
- `scripts/preflight.mjs`: bloquea preventivamente `runtime = "edge"` en la ruta de versión.
- `scripts/source-audit.mjs`: recorre `app/` y falla si reaparece cualquier `export const runtime = "edge"`.
- `app/globals.css`: corrige `align-items: end` a `flex-end`.
- `app/api/auth/logout/route.ts`: elimina parámetro no utilizado.
- `app/api/budgets/[budgetId]/workflow/route.ts`: se incluye la versión sin la importación `WorkflowStage` no utilizada.
- `eslint.config.mjs`: excluye el demo del lint de producción; sus pruebas standalone siguen ejecutándose por separado.

## No requiere

- Nueva migración D1.
- Cambiar `wrangler.jsonc`.
- Recrear la base.
- Cambiar Prisma.
- Cambiar secretos.
