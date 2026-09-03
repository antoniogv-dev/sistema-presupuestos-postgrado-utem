# Hotfix v12.1.2 — integración multianual / typecheck

Este hotfix corrige el build de Cloudflare observado el 03-09-2026 sin cambiar la versión funcional ni requerir migraciones D1.

## Archivos a reemplazar

- `lib/calculations/periods.ts`
- `lib/export/institutional-budget-xlsx.ts`

Copie ambos archivos sobre el repositorio `main`, respetando las rutas, reemplace los existentes y haga commit/push.

## Correcciones

1. Restaura `getAnnualTuitionChargePeriods()`:
   - reconoce el arancel una vez por cada año calendario activo;
   - en una cohorte de 4 semestres que inicia en 2026-2S reconoce 2026-2S, 2027-1S y 2028-1S;
   - mantiene separada la matrícula anual, que sigue cobrando por bloques de dos semestres.

2. Exporta `breakEvenExcelFormula()` y la hace compatible con:
   - exportación institucional estándar;
   - extensor institucional multianual existente.

3. Conserva el punto de equilibrio v12.1.2:
   - costos fijos netos de overhead y guía de tesis;
   - aporte de arancel neto de incobrabilidad y overhead;
   - aporte de matrícula neto de guía de tesis;
   - relación estudiantes / matrículas equivalentes;
   - rango B:D cuando la plantilla requiere el horizonte de tres columnas.

4. Para descuentos dinámicos, las filas de estudiantes y matrículas equivalentes se deducen automáticamente cuando el extensor multianual no las entrega explícitamente.

## No hacer

- No actualizar Prisma 6.19.0 por este hotfix.
- No aplicar migraciones D1 nuevas.
- No modificar `wrangler.jsonc` ni secrets.
- No cambiar `package.json`: la versión correcta sigue siendo `2.1.2-d1-web`.
