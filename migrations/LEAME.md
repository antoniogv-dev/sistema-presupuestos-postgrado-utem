# Migraciones de Cloudflare D1

Esta carpeta permanece en la raíz porque `wrangler.jsonc` declara `migrations_dir: "migrations"`.

## Orden

1. `0001_initial.sql` — estructura inicial.
2. `0002_seed.sql` — roles, plantillas y parámetros iniciales.
3. `0003_functional_improvements.sql` — autenticación interna, roles ampliados, sesiones, parámetros y mejoras funcionales v10.
4. `0004_budget_professional_parameters.sql` — v10.8:
   - versión editable del programa/plan;
   - habilitación explícita de becas por presupuesto;
   - parámetros anuales particulares de matrícula, hora docente directa, guía de tesis, dirección, asistencia y overhead;
   - prorrateos anuales persistentes de Dirección y Asistencia.
5. `0005_cashflow_costs_and_annual_tuition.sql` — v10.9:
   - arancel anual particular por presupuesto;
   - backfill de arancel para presupuestos existentes;
   - soporte del nuevo flujo de caja con todas las categorías de costos y gastos.

El deploy ejecuta:

```text
wrangler d1 migrations apply DB --remote
```

Cloudflare registra las migraciones ya aplicadas. En una instalación v10.8 existente se aplica sólo `0005` si `0001`–`0004` ya están registradas.

No copie estos SQL a `prisma/migrations` y no ejecute manualmente una migración que Wrangler ya haya aplicado.

- `0006_repair_annual_tuition_and_enrollment_rules.sql`: repara aranceles anuales en cero heredados; los descuentos siguen siendo exclusivos del arancel.
