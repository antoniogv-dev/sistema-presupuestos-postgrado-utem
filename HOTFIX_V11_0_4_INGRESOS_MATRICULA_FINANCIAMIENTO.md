# Hotfix v11.0.4 — matrícula reconocida y financiamiento institucional

Versión técnica: `1.1.4-d1-web`.

## Cambios

- La proporción definida en **Reconocimiento matrícula (%)** se incorpora a `INGRESOS TOTAL` del programa.
- La matrícula continúa sin descuentos.
- La matrícula reconocida **no** amplía la base de overhead. La base se mantiene como arancel bruto menos descuentos e incobrabilidad.
- Se incorpora el tipo **Financiamiento institucional**, registrado como un monto fijo del proyecto/programa en un año determinado.
- El financiamiento institucional no depende de semestre ni número de estudiantes.
- El financiamiento institucional tampoco amplía la base de overhead.
- Flujo, resumen financiero, PDF/XLSX y relato financiero consideran estos ingresos.

## Criterio de overhead

Se conserva un criterio prudente y trazable: el overhead se calcula exclusivamente sobre el ingreso arancelario neto sujeto a cobro. Esto evita aplicar overhead sobre matrícula reconocida o aportes institucionales mientras no exista una regla institucional expresa que indique lo contrario.

No se requiere migración D1: el nuevo financiamiento usa la estructura existente de ingresos externos y se distingue por su tipo.
