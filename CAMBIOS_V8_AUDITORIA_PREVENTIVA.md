# Versión 8 — auditoría preventiva de compilación

Esta versión corrige el error de unión de tipos en `TemplateManager.tsx` y agrega controles para evitar que Cloudflare vaya mostrando un error TypeScript distinto en cada despliegue.

## Correcciones funcionales y de tipos

- Reescritura tipada de `TemplateManager.tsx`.
- Configuraciones predeterminadas construidas mediante `switch`, preservando literales TypeScript.
- Actualización segura de configuraciones unidas mediante `patchConfig`.
- Compatibilidad de lectura con `key` e `itemKey`.
- Forma de respuesta uniforme para plantillas en GET, POST y PUT.
- Validación segura de cuerpos JSON recibidos desde las API.
- Uso explícito de `ZodError` en validaciones de usuarios y aranceles.
- Acceso a bindings OpenNext sin depender de una firma genérica específica.

## Barrera preventiva antes de OpenNext

`build:cloudflare` ejecuta ahora, antes de construir:

1. Generación Prisma.
2. Preflight de estructura y configuración.
3. Auditoría estática de patrones de riesgo.
4. TypeScript completo (`tsc --noEmit`).
5. ESLint.
6. Pruebas del motor.
7. Pruebas Vitest.
8. Pruebas autónomas.
9. Construcción OpenNext.

Así, TypeScript debe informar el conjunto de errores antes de que Next.js comience el empaquetado final.

## Verificaciones realizadas

- Auditoría estructural TypeScript de 45 archivos TS/TSX: aprobada.
- Compilación independiente del motor: aprobada.
- Pruebas autónomas: 12 de 12 aprobadas.
- Migraciones `0001` y `0002`: aplicadas en SQLite en memoria.
- Tablas creadas: 24.
- Roles iniciales: 3.
- Plantillas iniciales: 3.
- Ítems de plantilla: 5.
- Parámetros institucionales: 15.

## Configuración necesaria

Antes del despliegue productivo deben estar reemplazados en `wrangler.jsonc`:

- `database_id` de D1.
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`.
- `CLOUDFLARE_ACCESS_AUD`.
- `BOOTSTRAP_ADMIN_EMAIL`.
