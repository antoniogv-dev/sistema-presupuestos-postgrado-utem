# Verificación técnica v10.19

Versión: `1.0.29-d1-web` / `v10.19`.

## Comprobaciones ejecutadas

- `tsc -p tsconfig.engine.json`: correcto.
- Prueba ejecutable de proyección anual:
  - base 2027 = `$3.000.000`;
  - factor 5 %;
  - 2028 = `$3.150.000`;
  - 2029 = `$3.307.500`;
  - 2030 = `$3.472.875`.
- Prueba ejecutable de consolidación:
  - conjunto demo total: 4 presupuestos;
  - institucional activo: 3, excluyendo el Borrador;
  - institucional aprobado: 2;
  - consolidado MGP activo: 1, excluyendo el Borrador MGP.
- `npm run test:standalone`: 12/12 pruebas aprobadas.
- `npm run preflight`: correcto con configuración local de validación y 8 migraciones.
- `npm run source:audit`: correcto; sólo advertencias esperadas de placeholders de Cloudflare Access en la configuración local de validación.
- Chequeo TypeScript focalizado de `TemplateManager.tsx`: correcto con tipos internos reales y stubs únicamente para React.
- Chequeo TypeScript focalizado de `app/consolidado/page.tsx`: correcto con tipos internos reales y stubs de React/Next.

## Alcance

No se agrega migración D1. Los campos `baseYear` y `baseValue` se persisten en el JSON de configuración ya existente de `BudgetTemplateItem`.

El build integral Next.js/OpenNext se valida finalmente en Cloudflare, ya que el entorno de empaquetado no completó la instalación npm dentro del tiempo disponible.
