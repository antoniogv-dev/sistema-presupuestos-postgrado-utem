# Hotfix v11.0.10 — Etiquetas exactas del punto de equilibrio

Versión técnica: `1.1.10-d1-web`.

## Cambio

En la hoja **Flujo estudiantes** del XLSX institucional, las etiquetas quedan exactamente así:

- `matrículas equivalentes`
- `estudiantes`

Se eliminan definitivamente las leyendas:

- `matrículas equivalentes (fórmula)`
- `estudiantes (redondeo fórmula)`

## Alcance

Este ajuste es exclusivamente visual. No modifica:

- la fórmula de punto de equilibrio;
- la contribución neta por matrícula equivalente;
- incobrabilidad ni overhead;
- descuentos, ingresos o costos;
- migraciones D1;
- `wrangler.jsonc`.

La suite incorpora una validación exacta de las celdas C14 y C15.
