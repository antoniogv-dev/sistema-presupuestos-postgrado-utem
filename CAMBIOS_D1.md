# Cambios de la edición D1 web

## Cambio de infraestructura

Se reemplazó la arquitectura PostgreSQL + Hyperdrive por:

```text
Cloudflare Worker + binding DB + Cloudflare D1
```

Se eliminaron de producción:

- PostgreSQL.
- Hyperdrive.
- `DATABASE_URL`.
- `pg`.
- `@prisma/adapter-pg`.
- scripts de `psql`.
- Docker como requisito de implementación.
- workflows separados de migración y despliegue con secretos de cuenta.

## Implementación administrada desde web

El usuario puede realizar la instalación con:

- carga de archivos desde GitHub web;
- edición de `wrangler.jsonc` desde GitHub web;
- creación de D1 desde Cloudflare web;
- integración Git desde Workers & Pages;
- creación de Cloudflare Access desde Zero Trust;
- consultas de verificación desde la consola D1.

Los comandos de build, migración y despliegue son ejecutados por Cloudflare Workers Builds.

## Base de datos

- `prisma/schema.prisma` utiliza `provider = "sqlite"`.
- Prisma accede al binding `DB` mediante `@prisma/adapter-d1`.
- Las migraciones productivas se encuentran en `migrations/`.
- La estructura inicial se divide en:
  - `0001_initial.sql`;
  - `0002_seed.sql`.
- Los SQL de `database/d1/` son copias de referencia y control.

## Consistencia

Dado que Prisma no ofrece garantías transaccionales para D1:

- se eliminó el uso de `$transaction`;
- se incorporó `lib/database/d1-atomic.ts`;
- las operaciones críticas utilizan `D1Database.batch()`;
- cada batch se prepara antes de ejecutarse;
- ante una sentencia fallida, D1 revierte el conjunto.

## Despliegue

Los comandos productivos son:

```text
Build: npm run build
Deploy: npm run deploy
```

`npm run deploy` aplica primero las migraciones remotas pendientes y luego publica OpenNext.

## Funcionalidad conservada

La migración de infraestructura no elimina:

- aranceles propios por programa;
- plantillas editables;
- becas;
- descuentos;
- ingresos extraordinarios;
- costos manuales;
- costos compartidos;
- normalización y alertas;
- arrastre autorizado;
- consolidación;
- exportaciones;
- roles y aprobaciones;
- auditoría y versiones.
