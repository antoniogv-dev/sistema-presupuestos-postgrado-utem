# Cambios v10.8 — Parámetros profesionales, matrícula y prorrateos

Versión de aplicación: **1.0.18-d1-web**  
Release: **v10.8**

Esta versión amplía la formulación presupuestaria sin modificar las reglas de autenticación ya estabilizadas en producción.

## 1. Valor de hora docente directa por presupuesto y año

Cada presupuesto incorpora un valor anual editable para la hora de docencia directa. El valor institucional se usa como referencia inicial, pero puede modificarse para una versión/cohorte específica.

El costo anual se calcula como:

`horas docentes directas de los semestres activos × valor hora directa del año`.

## 2. Matrícula anual informativa, con descuentos

La matrícula se cobra una vez por cada dos semestres activos de la cohorte. Por ejemplo, una duración de cuatro semestres genera dos cobros de matrícula, aunque los semestres puedan abarcar tres años calendario.

Para cada cobro:

`matrícula bruta = estudiantes activos del periodo de cobro × valor matrícula anual`.

Se aplican los mismos descuentos de estudiantes vigentes para el periodo de cobro:

`matrícula neta = matrícula bruta − descuentos matrícula`.

El parámetro “Reconocimiento matrícula” se inicia en **0 %** y puede modificarse. El monto reconocido se muestra de manera informativa.

Por regla presupuestaria de esta versión, la matrícula **no se incorpora a INGRESOS TOTAL**. El total considera arancel neto y otros/extraordinarios.

## 3. Guía de tesis parametrizable

Se agrega un valor anual editable de guía de tesis por estudiante en graduación.

`costo guía de tesis = estudiantes en graduación × valor guía de tesis del año`.

## 4. Costos con periodicidad anual

Un costo manual marcado como **Anual** se replica una vez en cada año activo desde el año seleccionado hasta el término del presupuesto.

La periodicidad **Semestral** se replica en cada semestre activo desde el periodo de inicio, y **Único** sólo en el año indicado.

## 5. Overhead por año

Overhead central y de facultad son editables por año en programas afectos.

La base anual es:

`base overhead = arancel bruto − descuentos de arancel − incobrables`.

Luego:

`overhead central = base overhead × % central del año`  
`overhead facultad = base overhead × % facultad del año`.

Doctorados y magísteres académicos siguen sin overhead.

## 6. Versión del programa/plan separada de la revisión interna

Se incorpora **Versión del programa / plan**, editable y alfanumérica, independiente de la revisión técnica creada por el sistema.

Ejemplo:

- Versión del programa / plan: `7`
- Revisión interna del presupuesto: `R2`

Así, un programa que entra por primera vez a la plataforma puede registrar correctamente que corresponde a su versión 7.

## 7. Becas en programas profesionales

Los presupuestos nuevos de Magíster Profesional se crean con becas de arancel y manutención **deshabilitadas**.

La sección Becas dispone de un botón **Habilitar becas**. Al habilitarlas, se activan nuevamente sus parámetros y cálculos.

La migración conserva activadas las becas en presupuestos profesionales existentes que ya tengan estudiantes becados registrados.

## 8. Reconocimiento de matrícula en cero

Los nuevos presupuestos parten con reconocimiento de matrícula igual a **0 %**. El usuario puede cambiarlo expresamente cuando corresponda.

## 9. Porcentajes visibles como porcentaje

Los descuentos y los nuevos porcentajes de prorrateo/overhead se editan en interfaz con escala 0–100 y el símbolo `%`, aunque internamente se almacenan como tasas 0–1.

## 10. Asistencia anual editable

El monto base de asistencia queda editable por año. Puede utilizarse completo o prorratearse en programas profesionales.

## 11. Gastos comprometidos y prorrateo con versiones aprobadas

Para Dirección y Asistencia, el presupuesto identifica otras cohortes/versiones **aprobadas**, no eliminadas y superpuestas del mismo programa.

El sistema muestra:

- monto base del año;
- monto comprometido en otras versiones aprobadas;
- cantidad de otras versiones aprobadas superpuestas;
- porcentaje sugerido de distribución equitativa;
- porcentaje aplicado, editable;
- monto final aplicado a la versión actual.

Con una sola versión aprobada adicional, el porcentaje sugerido es **50 %**. Por ejemplo, para Dirección 2027 de `$4.152.675`:

`$4.152.675 × 50 % = $2.076.337,50`.

El prorrateo no se activa silenciosamente: el Gestor debe marcarlo, tras lo cual el sistema propone el porcentaje según las versiones aprobadas detectadas. Esto mantiene trazabilidad y evita alterar presupuestos aprobados sin una acción explícita.

## Persistencia D1

Se agrega `migrations/0004_budget_professional_parameters.sql`, que incorpora:

- `Program.versionLabel`;
- `CohortBudget.programVersionLabel`;
- `CohortBudget.scholarshipsEnabled`;
- tabla `BudgetAnnualOverride` para parámetros anuales particulares.

La migración se aplica automáticamente durante el deploy mediante el comando ya configurado `npm run db:migrations:apply`.

## Compatibilidad con correcciones de producción

v10.8 conserva expresamente:

- PBKDF2 en **100.000** iteraciones, compatible con Cloudflare Workers;
- `prisma generate` sin `--no-engine`, necesario para la integración Prisma + D1 + OpenNext usada por este proyecto;
- autenticación interna, sesiones y roles actuales;
- las tres migraciones anteriores sin reescribirlas.
