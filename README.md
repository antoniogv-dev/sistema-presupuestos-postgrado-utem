# Sistema de Presupuestos de Postgrado UTEM — v10 · GitHub web + Cloudflare D1

Aplicación institucional para formular, revisar, consolidar y exportar presupuestos de cohortes de programas de postgrado. Esta edición está preparada para operar con **GitHub web**, **Cloudflare Workers/OpenNext**, **Cloudflare D1** y **Cloudflare Access**, sin PostgreSQL ni Hyperdrive.

## Mejoras funcionales v10

- **Programas**: alta real en D1, modificación, filtros aplicables por texto/tipo/estado y edición de aranceles en la misma operación.
- **Arancel por programa**: fuente propia o plantilla **Doctorado**, **Magíster Académico** o **Magíster Profesional**.
- **Parámetros generales**: edición y persistencia D1 de parámetros comunes y por tipo de programa.
- **Versiones**: selección de presupuesto, versión base y versión comparada, con diferencias de snapshots.
- **Administración**: rol `ADMIN`, además de `CREADOR`, `LECTOR`, `GESTOR`, `VISTO_BUENO` y `APROBADOR`.
- **Administrador inicial**: aprovisionamiento seguro de **Antonio Gutiérrez** mediante `BOOTSTRAP_ADMIN_EMAIL`; la contraseña inicial opcional usa el secreto `BOOTSTRAP_ADMIN_PASSWORD`.
- **Credenciales internas**: PBKDF2-SHA256, sal aleatoria y sesiones HTTP-only; nunca se guarda la contraseña en texto plano.
- **Exportaciones**: XLSX/PDF por presupuesto, CSV de auditoría y XLSX/CSV del consolidado institucional.
- **Presupuestos**: orden funcional renovado; “Estudiantes y graduación”, “Horas docentes directas”, “Horas docentes de reemplazo” y “Becas” quedan en secciones distintas.
- **Panel principal y consolidado**: trabajan con datos persistidos en D1, no con presupuestos demostrativos.
- **Auditoría preventiva**: `preflight`, auditoría de fuentes, TypeScript, ESLint y pruebas se ejecutan antes del build OpenNext.

## Arquitectura

```text
GitHub web
   │
   ├── código, ramas, pull requests y CI
   ▼
Cloudflare Workers Builds
   │
   ├── npm install
   ├── quality:cloudflare
   ├── OpenNext build
   └── migraciones D1 pendientes + deploy
   ▼
Next.js en Cloudflare Workers
   │
   ├── Cloudflare Access / sesión interna
   └── binding DB
          │
          ▼
      Cloudflare D1
```

## Configuración de Cloudflare Builds

Variables de build recomendadas:

```text
NODE_VERSION = 22
SKIP_DEPENDENCY_INSTALL = 1
```

Build command:

```bash
npm install --include=dev --no-audit --no-fund && npm run build:cloudflare
```

Deploy command:

```bash
npm run deploy:cloudflare
```

## Base de datos D1

El repositorio contiene tres migraciones versionadas:

```text
migrations/0001_initial.sql
migrations/0002_seed.sql
migrations/0003_functional_improvements.sql
```

El despliegue aplica automáticamente las migraciones pendientes mediante:

```bash
wrangler d1 migrations apply DB --remote
```

Una base que ya tenga 0001 y 0002 **no debe recrearse**: la actualización v10 agrega 0003.

La verificación posterior está en:

```text
database/d1/VERIFICAR_D1.sql
```

## Administrador inicial

Configure en Cloudflare Workers > Settings > Variables and Secrets:

- `BOOTSTRAP_ADMIN_EMAIL`: correo real de Antonio Gutiérrez.
- `BOOTSTRAP_ADMIN_PASSWORD`: **Secret** opcional para habilitar el acceso interno inicial. No lo agregue a `wrangler.jsonc` ni a GitHub.

Cuando la identidad configurada ingresa por Cloudflare Access —o usa la ruta interna con el secreto configurado— el sistema reconcilia el usuario como **Antonio Gutiérrez** y le asigna `ADMIN`, `GESTOR`, `VISTO_BUENO` y `APROBADOR`. Después, desde Administración puede crear usuarios y distribuir funciones con mayor segregación.

## Roles

- `ADMIN`: administración total de usuarios, programas, parámetros y operaciones funcionales.
- `CREADOR`: alta de programas y presupuestos, sin aprobación.
- `LECTOR`: consulta sin escritura.
- `GESTOR`: modificación y formulación.
- `VISTO_BUENO`: revisión técnica.
- `APROBADOR`: aprobación final.

## Consistencia D1

Las operaciones críticas que afectan varias tablas —alta de programas con aranceles, actualización de parámetros, usuarios, presupuestos, versiones y auditoría— se ejecutan mediante `D1Database.batch()` para evitar persistencias parciales.

## Validación automatizada

`npm run build:cloudflare` ejecuta primero:

```text
Prisma generate
→ preflight
→ source audit
→ TypeScript
→ ESLint
→ motor financiero
→ Vitest
→ pruebas autónomas
→ OpenNext
```

Esto está diseñado para detectar varios problemas en una sola compilación antes de entrar a OpenNext.

## Documentación v10

- `ACTUALIZACION_GITHUB_WEB_V10.md`: actualización de un repositorio ya desplegado.
- `CAMBIOS_V10_MEJORAS_FUNCIONALES.md`: detalle de las mejoras implementadas.
- `VERIFICACION_V10.md`: pruebas realizadas y limitaciones de verificación.
- `GUIA_IMPLEMENTACION_GITHUB_CLOUDFLARE_D1_WEB.md`: instalación inicial.
- `migrations/LEAME.md`: orden y propósito de migraciones D1.
- `docs/formulas.md`: reglas financieras.
- `docs/manual-usuario.md`: operación funcional.
