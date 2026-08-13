# Cambios v10.10 — Arancel multianual, matrícula sin descuentos y costos trazables

Versión: `1.0.20-d1-web` / release `v10.10`.

## Cambios funcionales

1. **Matrícula sin descuentos**
   - Los descuentos de cohorte se aplican exclusivamente al arancel.
   - `enrollmentDiscounts` queda en 0.
   - La matrícula se muestra como una única línea informativa y no se suma a `INGRESOS TOTAL`.
   - Se eliminan del flujo `Descuentos matrícula` y `Matrícula neta`.

2. **Arancel en todos los años activos**
   - Un `annualTuition` histórico igual a 0 se interpreta como dato faltante.
   - El motor recupera el arancel del programa para el año correspondiente, con fallback al valor válido más cercano.
   - Esto hace que el segundo y siguientes años vuelvan a calcular arancel bruto, descuentos de arancel, incobrables, overhead e ingreso total.
   - Los nuevos guardados exigen arancel anual positivo para cada override.

3. **Reparación de datos históricos**
   - Nueva migración `0006_repair_annual_tuition_and_enrollment_rules.sql`.
   - Repara `BudgetAnnualOverride.annualTuition = 0` usando el arancel válido del programa.
   - No cambia usuarios, sesiones, roles, Secrets ni bindings.

4. **Costos y gastos**
   - `Alimentos y bebidas` está disponible en la formulación y también en plantillas de costos.
   - Todos los costos manuales guardados siguen incorporándose a `TOTAL COSTOS Y GASTOS` según categoría y periodicidad.
   - Se agrega un detalle anual dentro del flujo para verificar cada costo/gasto guardado sin duplicarlo en la sumatoria.
   - El detalle también se incorpora en reportes XLSX/PDF como información trazable ya incluida en los totales.

5. **Control de versión visible**
   - La barra lateral muestra `v10.10 · 1.0.20-d1-web` para detectar inmediatamente despliegues antiguos o parciales.
