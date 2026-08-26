# Hotfix v11.0.3 — XLSX institucional con descuentos dinámicos

Versión técnica: `1.1.3-d1-web`.

## Corrección

El exportador institucional ya no limita el presupuesto a dos descuentos. Cada beneficio o descuento configurado se conserva como una fila independiente en las hojas **Parámetros** y **Flujo estudiantes**, incluso cuando dos descuentos comparten el mismo porcentaje.

La estructura XLSX se amplía dinámicamente para mantener las fórmulas, subtotales, incobrabilidad, overhead, prorrateo de staff, guía de tesis y referencias del flujo total.

No modifica D1, migraciones ni `wrangler.jsonc`.
