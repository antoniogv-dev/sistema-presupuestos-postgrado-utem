# Sistema de Presupuestos de Postgrado UTEM — v10.12 · GitHub web + Cloudflare D1

Aplicación institucional para formular, revisar, consolidar y exportar presupuestos de cohortes de programas de postgrado. Esta edición está preparada para operar con GitHub web, Cloudflare Workers/OpenNext y Cloudflare D1.

## Mejoras funcionales v10.12

- **XLSX con trazabilidad completa:** cada presupuesto individual incorpora una segunda hoja llamada `Parámetros utilizados`.
- **PDF con anexo de parámetros:** después del flujo presupuestario se agregan páginas con los parámetros efectivos utilizados en el cálculo.
- **Parámetros anuales:** arancel, matrícula, valor hora docente directa, valor hora de reemplazo, guía de tesis, dirección, asistencia, otros honorarios no académicos, costos editables, incobrabilidad y overhead por año.
- **Parámetros semestrales:** estudiantes activos y en graduación, horas docentes, electivos, cursos especializados y becas cuando estén habilitadas.
- **Descuentos, ingresos y costos:** se registra en la exportación cada descuento de arancel, ingreso extraordinario y costo/gasto manual con su periodo y condición de aplicación.
- **Identificación y controles:** programa, cohorte, versión del plan, revisión interna, responsable, fuente de arancel, plantilla, arrastre, reconocimiento de matrícula y controles de costos compartidos.
- **Sin alterar cálculos:** esta versión agrega trazabilidad documental; no cambia las fórmulas financieras vigentes de v10.11.
- **Control de despliegue:** la aplicación muestra `v10.12 · 1.0.22-d1-web`.

## Mejoras funcionales v10.11

- **Flujo de caja como fuente principal de lectura de egresos:** los costos registrados en la sección “Costos y gastos” se integran dentro de la categoría correspondiente del flujo anual. Se elimina el bloque independiente “Detalle de costos y gastos registrados”.
- **Sin “Honorarios académicos adicionales”:** los costos académicos del flujo son horas docentes directas, horas docentes de reemplazo y guía de tesis.
- **Honorarios no académicos como subtotal de staff:** el subtotal corresponde a Dirección + Asistencia de dirección + Otros honorarios no académicos.
- **Otros honorarios no académicos prorrateables:** se parametrizan por año y pueden prorratearse en programas profesionales, igual que Dirección y Asistencia de dirección.
- **Categorías editables directamente en el flujo por año:** Gastos operacionales / Bienes y servicios, Software y licencias, Difusión, Congresos y pasantías, Libros y publicaciones, Pasajes y fletes, Viáticos, Alimentos y bebidas y Otros costos y gastos.
- **Costos nominados integrados:** cada registro manual aparece inmediatamente debajo de su categoría en el mismo flujo con el prefijo “Incluido:”, sin duplicarse en la sumatoria.
- **Persistencia D1:** los montos anuales editables del flujo y el nuevo staff se guardan en `BudgetAnnualOverride`.
- **Compatibilidad histórica:** las categorías antiguas se normalizan mediante la migración `0007_cashflow_editable_staff_and_costs.sql` sin eliminar registros.
- **Exportaciones alineadas:** XLSX/PDF usan la misma estructura conceptual del flujo v10.11.
## Reglas financieras vigentes

- La matrícula es anual, informativa y no recibe descuentos. No forma parte de `INGRESOS TOTAL`.
- Los descuentos de cohorte se aplican exclusivamente al arancel.
- El arancel se calcula para cada año activo del presupuesto.
- El overhead anual se calcula sobre arancel bruto menos descuentos de arancel menos incobrables.
- Un costo con periodicidad `Anual` se repite desde su año de inicio mientras existan años activos del presupuesto.
- Los costos nominados se suman a la categoría correspondiente del flujo; las líneas “Incluido:” son sólo trazabilidad visual y no vuelven a sumarse.

## Configuración Cloudflare Builds

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

## Migraciones D1

El proyecto contiene siete migraciones, en este orden:

```text
0001_initial.sql
0002_seed.sql
0003_functional_improvements.sql
0004_budget_professional_parameters.sql
0005_cashflow_costs_and_annual_tuition.sql
0006_repair_annual_tuition_and_enrollment_rules.sql
0007_cashflow_editable_staff_and_costs.sql
```

El despliegue aplica automáticamente sólo las migraciones pendientes mediante:

```bash
wrangler d1 migrations apply DB --remote
```

No vuelva a ejecutar manualmente migraciones que Cloudflare ya tenga registradas.

## Autenticación y seguridad

- `BOOTSTRAP_ADMIN_PASSWORD` debe mantenerse como Secret de Cloudflare y nunca almacenarse en GitHub.
- PBKDF2 utiliza 100.000 iteraciones, compatible con el runtime actualmente utilizado.
- El proyecto conserva sesiones internas HTTP-only, roles segregados y auditoría de cambios.
- El paquete incremental de actualización no debe reemplazar el `wrangler.jsonc` productivo.

## Validación automatizada

`npm run build:cloudflare` ejecuta antes de OpenNext:

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

## Documentación de esta versión

- `ACTUALIZACION_GITHUB_WEB_V10_11.md`
- `CAMBIOS_V10_11_FLUJO_EDITABLE_STAFF_COSTOS.md`
- `VERIFICACION_V10_11.md`
- `migrations/LEAME.md`
