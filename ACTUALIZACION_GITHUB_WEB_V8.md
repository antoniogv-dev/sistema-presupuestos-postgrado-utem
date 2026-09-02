# Actualización desde GitHub web — versión 8

## Recomendación

No reemplace `wrangler.jsonc`, porque ya contiene el ID real de su D1 y la configuración de Cloudflare Access.

Suba o reemplace únicamente los archivos del paquete de corrección, conservando sus rutas.

## Archivos modificados

- `features/templates/components/TemplateManager.tsx`
- `features/budgets/components/BudgetWorkspace.tsx`
- `app/api/templates/route.ts`
- `app/api/templates/[templateId]/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/programs/[programId]/tuition/route.ts`
- `lib/templates/api-shape.ts`
- `lib/runtime-env.ts`
- `scripts/preflight.mjs`
- `scripts/source-audit.mjs`
- `package.json`

## Commit sugerido

```text
fix: fortalece validación previa al despliegue en Cloudflare
```

## Configuración de Cloudflare web

### Variable

```text
NODE_VERSION = 22
```

### Para evitar Bun y utilizar npm de forma explícita

Variable:

```text
SKIP_DEPENDENCY_INSTALL = 1
```

Build command:

```text
npm install --include=dev --no-audit --no-fund && npm run build:cloudflare
```

Deploy command:

```text
npm run deploy:cloudflare
```

## Resultado esperado del nuevo build

Antes de OpenNext deben ejecutarse y aprobarse:

```text
preflight
source:audit
typecheck
lint
test:engine
test
test:standalone
```

Si existe más de un error TypeScript, `typecheck` los mostrará juntos antes del `next build`.
