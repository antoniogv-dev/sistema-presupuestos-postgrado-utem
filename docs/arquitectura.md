# Arquitectura funcional y técnica

## Arquitectura de producción

```text
GitHub web
   │
   ├── repositorio privado
   ├── ramas y pull requests
   └── GitHub Actions
   │
   ▼
Cloudflare Workers Builds
   │
   ├── Next.js + OpenNext
   ├── migraciones D1
   └── despliegue automático desde main
   │
   ▼
Cloudflare Access
   │
   ▼
Cloudflare Worker
   │
   └── binding DB
          │
          ▼
      Cloudflare D1
```

## Capas

1. **Presentación:** Next.js App Router, React y CSS basado en tokens.
2. **Aplicación:** CRUD de presupuestos, flujo de revisión, consolidación y exportación.
3. **Dominio:** motor financiero puro en `lib/calculations`.
4. **Validación:** Zod y reglas de dominio.
5. **Persistencia:** Prisma ORM mediante `@prisma/adapter-d1` y SQL nativo D1.
6. **Consistencia:** `D1Database.batch()` para escrituras críticas en múltiples tablas.
7. **Auditoría:** versiones, aprobaciones, eventos de flujo y eliminación lógica.
8. **Infraestructura:** GitHub Actions, OpenNext, Cloudflare Workers, Access y D1.

## Flujo funcional

Programa → arancel anual propio → presupuesto/cohorte → parámetros semestrales → estudiantes en graduación → ingresos y costos → flujo anual → consolidación → V°B° → aprobación.

## Separación de responsabilidades

- Los componentes React no contienen fórmulas financieras.
- `budget-engine.ts` calcula resultados sin depender de la base de datos.
- `budget-workflow.ts` concentra permisos y transiciones.
- `report-model.ts` define una fuente única para XLSX, PDF y tabla web.
- Las rutas API aplican autorización por nivel y registran auditoría.
- Prisma se utiliza en lecturas tipadas y operaciones simples.
- `d1-atomic.ts` ejecuta batches atómicos para cabecera, detalle, versión y auditoría.
- `migrations/` es la fuente de verdad del esquema productivo.

## Persistencia incorporada

- `ProgramAnnualTuition`: arancel por programa y año.
- `AnnualParameter.scope`: parámetros generales o por tipo de programa.
- `SemesterParameters.graduatingStudents`: base para guía de tesis.
- `CohortBudget.workflowStage`: etapa del circuito de revisión.
- `CohortBudget.deletedAt/deletedById`: eliminación lógica.
- `BudgetWorkflowEvent`: trazabilidad de cada transición.
- `Approval.level`: diferencia V°B° y aprobación final.
- `AnnualFinancialFlow`: matrículas equivalentes, guía de tesis, overhead y rendimiento.
- `BudgetTemplate` y `BudgetTemplateItem`: plantillas configurables y versionadas.

## Acceso

- **Gestor:** crea, modifica y elimina borradores; envía a V°B°.
- **V°B°:** observa o deriva a aprobación.
- **Aprobador:** aprueba, observa y puede autorizar eliminación lógica de aprobados.

La identidad proviene de Cloudflare Access. El Worker valida firma, emisor y audiencia del JWT y luego resuelve los roles desde D1.

## Entornos

La implementación inicial utiliza una única base productiva D1. Los despliegues automáticos de ramas no productivas deben permanecer desactivados hasta crear:

- un Worker de pruebas;
- una base D1 de pruebas;
- un `wrangler` o environment separado.
