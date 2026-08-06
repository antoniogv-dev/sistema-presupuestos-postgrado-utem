# Sistema de Presupuestos de Postgrado UTEM — edición D1 web

Aplicación institucional para formular, revisar, consolidar y exportar presupuestos de cohortes de programas de postgrado.

Esta edición fue preparada específicamente para una implementación administrada desde:

- **GitHub web**, como repositorio, control de cambios y revisión.
- **Cloudflare web**, como plataforma de compilación y despliegue.
- **Cloudflare D1**, como base de datos SQL administrada.
- **Cloudflare Access**, como puerta de acceso institucional.

No requiere PostgreSQL, Hyperdrive ni una variable `DATABASE_URL` en producción.

## Funciones incluidas

- Programas y cohortes presupuestarias.
- Arancel anual personalizado por programa.
- Plantillas editables para Doctorado, Magíster Académico y Magíster Profesional.
- Becas de arancel y manutención.
- Descuentos configurables.
- Ingresos extraordinarios.
- Gastos y costos únicos o compartidos.
- Normalización de costos compartidos y alertas de duplicidad.
- Arrastre inicial autorizado.
- Matrículas equivalentes y estudiantes aproximados.
- Guía de tesis según estudiantes en graduación.
- Overhead igual a cero para programas académicos.
- Consolidado institucional, académico, profesional y por programa.
- Exportación XLSX y PDF.
- Flujo de acceso Gestor → V°B° → Aprobación.
- Versionamiento, auditoría y eliminación lógica.

## Arquitectura

```text
GitHub web
   │
   ├── código, ramas, pull requests y GitHub Actions
   │
   ▼
Cloudflare Workers Builds
   │
   ├── npm run build
   ├── npm run deploy
   └── aplica migraciones D1 pendientes
   │
   ▼
Next.js + OpenNext en Cloudflare Workers
   │
   ├── Cloudflare Access
   └── binding DB
          │
          ▼
      Cloudflare D1
```

## Inicio recomendado

1. Lea `GUIA_IMPLEMENTACION_GITHUB_CLOUDFLARE_D1_WEB.md`.
2. Cree la base D1 desde Cloudflare web.
3. Reemplace los valores `REEMPLAZAR_*` de `wrangler.jsonc`.
4. Cargue el contenido de esta carpeta en un repositorio privado mediante GitHub web.
5. Conecte el repositorio desde **Workers & Pages**.
6. Use:

```text
Build command: npm run build
Deploy command: npm run deploy
Production branch: main
Root directory: /
```

7. Configure Cloudflare Access y vuelva a desplegar.
8. Ingrese con el correo indicado en `BOOTSTRAP_ADMIN_EMAIL`.

## Base de datos D1

El repositorio contiene dos migraciones versionadas:

```text
migrations/0001_initial.sql
migrations/0002_seed.sql
```

El comando de despliegue ejecuta automáticamente:

```bash
wrangler d1 migrations apply DB --remote
```

No ejecute manualmente estas migraciones desde la consola SQL de D1, porque se perdería la trazabilidad de migraciones aplicadas.

La verificación posterior está en:

```text
database/d1/VERIFICAR_D1.sql
```

## Persistencia y consistencia

Prisma se utiliza para lecturas tipadas y operaciones simples mediante `@prisma/adapter-d1`. Las escrituras críticas que modifican varias tablas utilizan `D1Database.batch()` para obtener ejecución atómica en D1. Esto se aplica, entre otros, a:

- creación y actualización completa de presupuestos;
- versionamiento y auditoría;
- asignación de roles;
- aplicación de plantillas;
- transiciones de V°B° y aprobación;
- eliminación lógica.

## Demostración autónoma

Abra `demo/index.html` para revisar la interfaz sin conectarse a Cloudflare. La demostración guarda los cambios en el navegador y no modifica D1.

## Validación automatizada

GitHub Actions ejecuta:

```bash
npm install --no-audit --no-fund
npm run verify
```

La verificación comprende:

- generación del cliente Prisma;
- preflight de configuración D1;
- TypeScript estricto;
- motor financiero;
- pruebas unitarias;
- pruebas autónomas;
- build OpenNext para Cloudflare.

## Documentación

- `GUIA_IMPLEMENTACION_GITHUB_CLOUDFLARE_D1_WEB.md`: instalación completa, sólo mediante interfaces web.
- `CHECKLIST_D1_WEB.md`: lista de control de puesta en marcha.
- `CAMBIOS_D1.md`: diferencias respecto de la edición PostgreSQL.
- `VERIFICACION_D1_WEB.md`: controles ejecutados sobre esta entrega.
- `docs/formulas.md`: reglas financieras.
- `docs/manual-usuario.md`: operación funcional.
- `docs/arquitectura.md`: arquitectura técnica.
- `docs/decisiones-y-pendientes.md`: decisiones y validaciones institucionales pendientes.
