# Hotfix v11.0.9 — Etiquetas limpias del punto de equilibrio

Versión técnica: `1.1.9-d1-web`.

En la hoja **Flujo estudiantes** del XLSX institucional se eliminan las referencias textuales a la fórmula en la columna C:

- `matrículas equivalentes (fórmula)` → `matrículas equivalentes`
- `estudiantes (redondeo fórmula)` → `estudiantes`

Las fórmulas de cálculo permanecen sin cambios:

- celda B del punto de equilibrio: fórmula dinámica institucional;
- celda B del mínimo entero: `ROUNDUP(...,0)`.

No modifica D1, migraciones, cálculos ni `wrangler.jsonc`.
