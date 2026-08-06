# Migraciones de Cloudflare D1

Esta carpeta debe permanecer en la raíz del repositorio GitHub.

Archivos:

1. `0001_initial.sql`: crea la estructura completa de la base D1.
2. `0002_seed.sql`: incorpora roles, plantillas y parámetros iniciales.

El archivo `wrangler.jsonc` utiliza:

```json
"migrations_dir": "migrations"
```

No mueva estos archivos a `prisma/migrations`, porque Cloudflare D1 busca las migraciones en esta carpeta.
