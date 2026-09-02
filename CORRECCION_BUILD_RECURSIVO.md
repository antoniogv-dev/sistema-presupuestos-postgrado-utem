# Corrección del build recursivo en Cloudflare

El script `build` debe ejecutar exclusivamente `next build`.

OpenNext invoca internamente el script `build` del `package.json`. Si `build` llama a `opennextjs-cloudflare build`, se genera una recursión infinita hasta que Cloudflare agota el tiempo de compilación.

Configuración correcta:

```json
"build": "next build",
"build:cloudflare": "npm run db:generate && opennextjs-cloudflare build",
"deploy:cloudflare": "npm run db:migrations:apply && opennextjs-cloudflare deploy"
```

En Cloudflare Workers Builds:

- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy:cloudflare`
- Variable recomendada: `NODE_VERSION=22`
