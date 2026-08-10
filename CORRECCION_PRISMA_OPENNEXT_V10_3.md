# Corrección Prisma/OpenNext v10.3

Se detectó una omisión real en la integración Prisma + OpenNext para Cloudflare Workers: `next.config.ts` no declaraba `serverExternalPackages` para `@prisma/client` y `.prisma/client`.

OpenNext indica que ambos paquetes deben externalizarse para que el cliente Prisma generado pueda incluirse correctamente en el bundle `workerd`.

Cambios:
- `next.config.ts`: agrega `serverExternalPackages: ["@prisma/client", ".prisma/client"]`.
- `package.json`: agrega `prisma validate` antes de `prisma generate` y mantiene Prisma/Client/adapter D1 en 6.19.0.
- `scripts/preflight.mjs` y `scripts/source-audit.mjs`: verifican automáticamente esta integración y evitan regresiones.

No cambia D1, no agrega migraciones y no modifica `wrangler.jsonc`.
