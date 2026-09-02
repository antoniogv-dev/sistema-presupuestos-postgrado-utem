# Corrección preventiva v9 — Next.js / OpenNext

El build de Cloudflare se detuvo antes de compilar porque npm detectó una incompatibilidad de peer dependencies:

- `@opennextjs/cloudflare@1.20.2` requiere `next >=15.5.21 <16 || >=16.2.11`.
- el proyecto v8 tenía `next@15.5.20`.

La v9 fija de forma explícita:

- `next@15.5.22`
- `eslint-config-next@15.5.22`
- `@opennextjs/cloudflare@1.20.2`

Además, `scripts/preflight.mjs` valida que Next.js cumpla el mínimo requerido por OpenNext y que `eslint-config-next` coincida exactamente con la versión de Next.js.

## GitHub web

Si ya tiene la v8 aplicada, basta con reemplazar:

1. `package.json`
2. `scripts/preflight.mjs`

Mensaje sugerido:

```text
fix: alinea Next.js con OpenNext para Cloudflare
```

## Cloudflare web

Mantenga:

```text
SKIP_DEPENDENCY_INSTALL = 1
NODE_VERSION = 22
```

Build command:

```bash
npm install --include=dev --no-audit --no-fund && npm run build:cloudflare
```

Deploy command:

```bash
npm run deploy:cloudflare
```

No use `--force` ni `--legacy-peer-deps`: la v9 corrige la incompatibilidad real en vez de ocultarla.
