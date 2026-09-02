# Actualización mayor v11.1.0 — Arancel total del programa

Versión técnica: `1.2.0-d1-web`.

## Arquitectura

La formulación distingue ahora el **precio académico** de su **reconocimiento presupuestario**. El modo `ANNUAL_LEGACY` conserva la estructura histórica. El modo `PROGRAM_TOTAL` define un único arancel para el programa completo y lo distribuye entre sus semestres activos.

## Modalidades de matrícula

- `ANNUAL`: compatibilidad histórica, una matrícula por cada bloque de dos semestres.
- `SINGLE_SPECIAL`: una matrícula única al inicio del programa.
- `SEMESTER`: una matrícula en cada semestre activo.

## Distribución de arancel

- `PROPORTIONAL`: partes iguales entre los semestres.
- `CUSTOM`: porcentajes editables por semestre, con validación obligatoria de 100 %.

La distribución sólo determina el año y semestre en que se reconoce el ingreso. No cambia el arancel total.

## Descuentos

Cada descuento declara su objetivo: `TUITION` o `ENROLLMENT`. El overhead continúa calculándose exclusivamente sobre arancel neto sujeto a cobro.

## Compatibilidad

La migración utiliza defaults `ANNUAL_LEGACY`, `ANNUAL` y `TUITION`, de modo que los presupuestos existentes no cambian de comportamiento.

## Exportación

Los presupuestos profesionales históricos conservan la plantilla institucional XLSX. Los presupuestos con arancel total o descuentos de matrícula utilizan el XLSX trazable general, que incluye la estructura de cobro completa y su distribución semestral.

## Base de datos

Requiere aplicar `migrations/0013_program_total_billing.sql`.
