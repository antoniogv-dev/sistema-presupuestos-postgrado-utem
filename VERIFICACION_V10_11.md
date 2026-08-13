# Verificación técnica v10.11

Versión: `1.0.21-d1-web`  
Release funcional: `v10.11`

## Verificaciones ejecutadas correctamente

1. **Sintaxis TypeScript/TSX** de los 14 archivos principales modificados mediante el compilador TypeScript 5.8.3: correcta.
2. **Compilación independiente del motor financiero** con `tsc -p tsconfig.engine.json`: correcta.
3. **Pruebas funcionales específicas v10.11**:
   - Dirección, Asistencia de dirección y Otros honorarios no académicos forman correctamente el subtotal de honorarios no académicos.
   - Otros honorarios no académicos admite prorrateo anual.
   - No existe `manualAcademicHonoraria` en el resultado financiero.
   - Costos nominados se suman a las categorías operacionales correspondientes.
   - Costos con periodicidad anual se repiten en años posteriores activos.
   - `Alimentos y bebidas` y `Pasajes y fletes` impactan `TOTAL COSTOS Y GASTOS`.
   - El modelo de exportación no contiene `Honorarios académicos adicionales` y sí contiene el subtotal de honorarios no académicos.
4. **Pruebas autónomas históricas**: 12 de 12 aprobadas.
5. **Preflight**: correcto con Node 22, Next/OpenNext compatibles, Prisma/D1 alineado y siete migraciones detectadas.
6. **Source audit**: correcto. Sólo se emitieron advertencias esperadas por los valores placeholder del `wrangler.jsonc` temporal usado exclusivamente para la prueba local.
7. **Migraciones D1**:
   - 0001 a 0007 aplicadas secuencialmente sobre una base SQLite limpia.
   - verificada la existencia de todas las nuevas columnas de `BudgetAnnualOverride`.
   - verificada la normalización de categorías históricas en una actualización 0001–0006 → 0007.
8. **Bindings de los INSERT D1 de BudgetAnnualOverride**: 27 placeholders y 27 argumentos tanto en creación como actualización.
9. **Scripts `preflight.mjs` y `source-audit.mjs`**: sintaxis Node válida.

## Verificación visual que debe realizarse después del deploy

- La barra lateral debe mostrar `v10.11` y `1.0.21-d1-web`.
- `/api/version` debe devolver `release: "v10.11"`.
- No debe aparecer `Honorarios académicos adicionales`.
- `HONORARIOS NO ACADÉMICOS (SUBTOTAL)` debe ser la suma de Dirección, Asistencia de dirección y Otros honorarios no académicos.
- Las nueve categorías operacionales deben ser editables directamente en el flujo mientras el presupuesto esté en una etapa editable.
- Un costo creado en `Costos y gastos` debe aparecer en el flujo, debajo de su categoría, como `Incluido: <nombre>` y ya contenido en el total de la categoría.
- No debe aparecer una tabla independiente `Detalle de costos y gastos registrados`.

## Limitación de la verificación local

Se intentó instalar todas las dependencias npm para ejecutar el build completo Next.js + Prisma + OpenNext en este entorno, pero la instalación superó el límite de tiempo disponible y no dejó `node_modules`. Por ello no se declara un build integral local exitoso.

El build productivo de Cloudflare seguirá ejecutando la cadena completa configurada en `build:cloudflare`, incluida generación de Prisma, TypeScript, ESLint, pruebas y OpenNext. Las verificaciones específicas de código, motor financiero, migraciones y SQL descritas arriba sí fueron ejecutadas correctamente antes de empaquetar esta versión.
