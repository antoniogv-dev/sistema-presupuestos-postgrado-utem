# Verificación v11.0.9 — Etiquetas del punto de equilibrio

Versión técnica: `1.1.9-d1-web`.

## Cambio
En la hoja `Flujo estudiantes` del XLSX institucional se mantienen intactas las fórmulas del punto de equilibrio, pero se limpian las etiquetas informativas de la columna C:

- `matrículas equivalentes (fórmula)` → `matrículas equivalentes`
- `estudiantes (redondeo fórmula)` → `estudiantes`

## Fórmulas preservadas
- Punto de equilibrio: se mantiene la fórmula Excel dinámica definida en v11.0.8.
- Mínimo entero: se mantiene `ROUNDUP(B14,0)` o la referencia dinámica equivalente cuando existen filas adicionales de descuentos.

## Controles ejecutados
- `source:audit`: correcto.
- `preflight`: correcto; 12 migraciones D1 verificadas.
- `platform-integrity-audit`: 12/12 controles correctos.
- `tsc -p tsconfig.engine.json`: correcto.

No requiere migración D1 ni modificación de `wrangler.jsonc`.
