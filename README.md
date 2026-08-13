# Sistema de Presupuestos de Postgrado UTEM — v10.10 · GitHub web + Cloudflare D1

Aplicación institucional para formular, revisar, consolidar y exportar presupuestos de cohortes de programas de postgrado. Esta edición está preparada para operar con **GitHub web**, **Cloudflare Workers/OpenNext**, **Cloudflare D1** y **Cloudflare Access**, sin PostgreSQL ni Hyperdrive.

## Mejoras funcionales v10.10

- **Matrícula sin descuentos**: los descuentos de cohorte se aplican exclusivamente al arancel. La matrícula permanece informativa y fuera de `INGRESOS TOTAL`.
- **Arancel garantizado por año activo**: si un override histórico quedó en `0`, el motor recupera el arancel válido del programa para ese año; así el segundo y siguientes años vuelven a generar arancel bruto, descuentos, incobrables e ingreso neto.
- **Costos y gastos trazables**: cada costo guardado se sigue incorporando a `TOTAL COSTOS Y GASTOS` y, además, aparece en un detalle anual dentro del flujo de caja.
- **Alimentos y bebidas**: categoría disponible tanto en el presupuesto como en plantillas de costos.
- **Control de despliegue**: la barra lateral muestra `v10.10 · 1.0.20-d1-web` para detectar de inmediato un despliegue antiguo o parcial.
- **Migración 0006**: repara aranceles anuales históricos en cero sin modificar bindings, secretos ni configuraciones productivas.

## Mejoras funcionales v10.9

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
- **Parámetros profesionales v10.8**: matrícula anual con descuentos fuera de `INGRESOS TOTAL`, hora docente directa y guía de tesis editables por año, Dirección/Asistencia prorrateables y overhead anual.
- **Versión del programa/plan**: editable e independiente de la revisión interna del presupuesto.
- **Becas profesionales**: deshabilitadas por defecto y habilitables expresamente.
- **Flujo de caja v10.9**: incorpora todas las familias de costos y gastos visibles, agrega `Alimentos y bebidas` y consolida la matrícula en una sola línea informativa neta de descuentos.
- **Arancel anual v10.9**: editable y persistente para cada año activo de la cohorte, con recuperación automática de valores faltantes/ceros desde el arancel válido más cercano del programa.

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

El repositorio contiene cinco migraciones versionadas:

```text
migrations/0001_initial.sql
migrations/0002_seed.sql
migrations/0003_functional_improvements.sql
migrations/0004_budget_professional_parameters.sql
migrations/0005_cashflow_costs_and_annual_tuition.sql
```

El despliegue aplica automáticamente las migraciones pendientes mediante:

```bash
wrangler d1 migrations apply DB --remote
```

Una base v10.8 que ya tenga 0001–0004 **no debe recrearse**: la actualización v10.9 agrega únicamente 0005.

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

## Documentación v10.9

- `ACTUALIZACION_GITHUB_WEB_V10_9.md`: actualización recomendada de una instalación v10.8 ya desplegada.
- `CAMBIOS_V10_9_FLUJO_COSTOS_ARANCEL.md`: detalle funcional de flujo, costos y arancel anual.
- `VERIFICACION_V10_9.md`: verificaciones ejecutadas y comprobaciones posteriores al deploy.
- Documentación v10.8 se conserva como referencia histórica.
- `ACTUALIZACION_GITHUB_WEB_V10.md`: referencia histórica de v10.
- `CAMBIOS_V10_MEJORAS_FUNCIONALES.md`: detalle de las mejoras implementadas.
- `VERIFICACION_V10.md`: pruebas realizadas y limitaciones de verificación.
- `GUIA_IMPLEMENTACION_GITHUB_CLOUDFLARE_D1_WEB.md`: instalación inicial.
- `migrations/LEAME.md`: orden y propósito de migraciones D1.
- `docs/formulas.md`: reglas financieras.
- `docs/manual-usuario.md`: operación funcional.
