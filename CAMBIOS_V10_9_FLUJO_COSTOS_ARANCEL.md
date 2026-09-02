# Cambios v10.9 — Flujo de caja, costos y arancel anual

Versión: 1.0.19-d1-web.

## Cambios funcionales

1. Se incorpora la categoría **Alimentos y bebidas** en Costos y gastos.
2. El flujo de caja muestra todas las familias de costos y gastos que pueden registrarse en el formulario: honorarios académicos adicionales, honorarios no académicos, dirección, asistencia, gastos operacionales/bienes y servicios, software, difusión, congresos y pasantías, libros y publicaciones, pasajes y fletes, viáticos, alimentos y bebidas y otros.
3. Se eliminan del flujo las filas separadas **Descuentos matrícula** y **Matrícula neta**. La matrícula queda en una sola línea informativa, ya neta de descuentos, sin incorporarse a INGRESOS TOTAL.
4. El arancel pasa a ser un parámetro anual de cada presupuesto. Se muestra y edita para todos los años activos de la cohorte.
5. Se agrega la migración D1 `0005_cashflow_costs_and_annual_tuition.sql`, que añade `annualTuition` a `BudgetAnnualOverride` y rellena los presupuestos existentes desde el arancel maestro del programa.
6. Exportaciones XLSX/PDF se alinean con el nuevo flujo: no muestran las dos filas eliminadas e incorporan Alimentos y bebidas y las demás familias de costo.

## Compatibilidad

La migración es incremental sobre v10.8. No modifica usuarios, sesiones, roles ni secretos de Cloudflare.
