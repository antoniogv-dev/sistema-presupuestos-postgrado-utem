# Migraciones de Cloudflare D1

Esta carpeta permanece en la raíz porque `wrangler.jsonc` declara `migrations_dir: "migrations"`.

## Orden

1. `0001_initial.sql` — estructura inicial.
2. `0002_seed.sql` — roles, plantillas y parámetros iniciales.
3. `0003_functional_improvements.sql` — autenticación interna, sesiones, roles ampliados y mejoras funcionales v10.
4. `0004_budget_professional_parameters.sql` — parámetros particulares anuales, versión del programa/plan, becas y prorrateos de Dirección/Asistencia.
5. `0005_cashflow_costs_and_annual_tuition.sql` — arancel anual particular y soporte de categorías del flujo.
6. `0006_repair_annual_tuition_and_enrollment_rules.sql` — reparación defensiva de aranceles anuales históricos en cero y matrícula sin descuentos.
7. `0007_cashflow_editable_staff_and_costs.sql` — v10.11:
   - agrega Otros honorarios no académicos con prorrateo anual;
   - agrega bases anuales editables para las categorías operacionales del flujo;
   - normaliza categorías históricas de `BudgetItem` a las denominaciones actuales;
   - permite que costos nominados y valores base convivan dentro de un mismo subtotal anual sin perder trazabilidad.

El deploy ejecuta:

```text
wrangler d1 migrations apply DB --remote
```

Cloudflare aplica únicamente las migraciones pendientes y mantiene el historial de las ya ejecutadas.

No copie estos SQL a `prisma/migrations` y no ejecute manualmente una migración que Wrangler ya haya aplicado.
