# Migraciones de Cloudflare D1

Esta carpeta debe permanecer en la raíz del repositorio GitHub porque `wrangler.jsonc` declara:

```json
"migrations_dir": "migrations"
```

## Orden de migraciones

1. `0001_initial.sql` — estructura inicial de la aplicación.
2. `0002_seed.sql` — roles originales, plantillas presupuestarias y parámetros iniciales.
3. `0003_functional_improvements.sql` — mejoras funcionales v10:
   - credenciales internas seguras y sesiones;
   - roles `ADMIN`, `CREADOR` y `LECTOR` además de Gestor, V°B° y Aprobador;
   - selección de plantilla de arancel para Doctorado, Magíster Académico y Magíster Profesional;
   - parámetros generales editables y valores 2026–2030;
   - soporte del tipo de plantilla en aranceles por programa.

El despliegue ejecuta:

```bash
wrangler d1 migrations apply DB --remote
```

Cloudflare registra las migraciones ya aplicadas, por lo que una instalación existente no necesita recrear la base: al desplegar esta versión se aplica solamente `0003_functional_improvements.sql` si 0001 y 0002 ya estaban registradas.

No copie estos archivos a `prisma/migrations` y no ejecute el mismo SQL manualmente en la consola D1 después de haberlo aplicado con Wrangler.
