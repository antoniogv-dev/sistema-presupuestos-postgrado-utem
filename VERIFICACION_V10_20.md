# Verificación técnica v10.20

Versión verificada: **1.0.30-d1-web / v10.20**.

## Comprobaciones realizadas

- Compilación estricta del motor financiero con TypeScript 5.8.3: correcta.
- Prueba de matrícula profesional iniciada en 1S: un cobro por cada bloque de dos semestres.
- Prueba de matrícula profesional iniciada en 2S: cobros en 2027-2S y 2028-2S, sin cobro extra en 2029-1S.
- Prueba de estudiantes variables: cada matrícula usa los estudiantes activos del semestre de cobro.
- Prueba de `annualEnrollmentFee = 0` histórico: se recupera la referencia anual institucional.
- Verificación de que `enrollmentDiscounts = 0` y la matrícula permanece fuera de `totalIncome`.
- Simulación SQL/D1 de modificación de plantilla profesional: actualización, incremento de versión y persistencia de configuración correctos.
- `preflight`: correcto con configuración de validación.
- `source:audit`: correcto con las advertencias esperadas por placeholders de Cloudflare Access.

## Build integral

La instalación completa de dependencias npm no finalizó dentro del tiempo disponible del entorno de preparación. Por ello, la validación integral Next.js + OpenNext queda a cargo del build de Cloudflare, que ya ejecuta `typecheck`, `lint`, pruebas y auditorías antes del despliegue.

## D1

No se incorpora una migración nueva. La corrección histórica de matrícula se resuelve al hidratar/calcular el presupuesto y se persistirá cuando el presupuesto sea guardado nuevamente.
