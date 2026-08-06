# Informe de verificación — edición D1 web

## Alcance

Se revisó la conversión de la aplicación desde PostgreSQL/Hyperdrive hacia Cloudflare D1 y una instalación administrable desde GitHub web y Cloudflare web.

## Controles realizados

### Estructura

- Binding D1 `DB` presente en `wrangler.jsonc`.
- Directorio `migrations` configurado.
- Configuración OpenNext presente.
- Workflow GitHub de verificación presente.
- Archivos del pack: 92, compatible con una carga web única de GitHub.
- Archivo de mayor tamaño: inferior a 1 MiB; ninguno supera 25 MiB.

### Base de datos

Las migraciones `0001_initial.sql` y `0002_seed.sql` fueron ejecutadas sobre SQLite en memoria para comprobar sintaxis y dependencias.

Resultados:

```text
Tablas funcionales: 24
Roles: 3
Plantillas: 3
Ítems de plantilla: 5
Parámetros institucionales: 15
Tipo de descuento inicial: 1
```

Se verificaron claves foráneas, índices, restricciones únicas y datos iniciales.

### Código

- Prisma configurado con proveedor SQLite.
- Adaptador de producción `@prisma/adapter-d1`.
- No se utiliza una cadena PostgreSQL ni Hyperdrive.
- No existe uso de `prisma.$transaction`.
- Escrituras críticas refactorizadas a `D1Database.batch()`.
- Validación de JWT de Cloudflare Access conservada.
- Aprovisionamiento inicial de administrador conservado.

### Motor y demostración

- Pruebas autónomas del motor financiero ejecutadas.
- Sintaxis JavaScript de la demostración validada.
- Carga HTTP de la demostración validada.
- Fórmulas financieras y exportaciones conservadas.

## Limitaciones de esta verificación

El entorno de construcción no tuvo acceso operativo al registro público de npm. Por ello, no fue posible ejecutar aquí:

- instalación completa de dependencias;
- generación real del cliente Prisma con la versión publicada;
- `next build` completo;
- build OpenNext;
- despliegue real en una cuenta Cloudflare;
- prueba contra una base D1 remota.

Estas comprobaciones quedan incorporadas en `.github/workflows/ci.yml` y en el build conectado de Cloudflare. El primer despliegue debe considerarse una validación técnica controlada antes de ingresar datos oficiales.

## Riesgo técnico conocido

La integración Prisma con Cloudflare D1 es identificada por Prisma como Preview. El proyecto mitiga la ausencia de garantías transaccionales de Prisma D1 mediante batches atómicos nativos para operaciones que afectan varias tablas.

## Criterio de aceptación recomendado

No cargar información oficial hasta que:

1. GitHub Actions finalice correctamente.
2. Cloudflare construya y despliegue sin errores.
3. D1 registre ambas migraciones.
4. `/api/health` responda correctamente.
5. Cloudflare Access valide una cuenta institucional.
6. Se complete el circuito de prueba Gestor → V°B° → Aprobación.
7. XLSX y PDF se descarguen correctamente desde producción.
