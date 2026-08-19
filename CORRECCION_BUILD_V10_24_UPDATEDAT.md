# Corrección build v10.24

Cloudflare detuvo el build en `tsc --noEmit` porque `updatedAt` es opcional en el tipo de presupuesto y la ordenación llamaba directamente `localeCompare` sobre un posible `undefined`.

Corrección aplicada:

```ts
.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
```

La corrección no modifica reglas financieras, D1, migraciones, Prisma, `wrangler.jsonc` ni variables de Cloudflare. La versión se mantiene en `v10.24 / 1.0.34-d1-web` porque el despliegue anterior no completó.
