# Hotfix v11.0.11 — Descuento X% visible y vinculado en Flujo estudiantes

Versión técnica: `1.1.11-d1-web`.

## Mejora

En la hoja **Flujo estudiantes** del XLSX institucional, las filas correspondientes a beneficios y descuentos se muestran exclusivamente como **Descuento X%**, donde `X` se obtiene mediante fórmula desde la hoja **Parámetros**.

La fórmula OOXML se guarda con la función estándar `CONCATENATE`; Excel en español la presenta localizada como `CONCATENAR`, equivalente a:

`=CONCATENAR("Descuento ";((+Parámetros!B10)*100);"%")`

El mismo criterio se aplica en las filas inferiores de ingresos por arancel con descuento. Los nombres administrativos de convenios o beneficios se mantienen intactos en **Parámetros**, por lo que no se pierde trazabilidad.

La mejora funciona con N descuentos y no modifica los cálculos de estudiantes equivalentes, ingresos, punto de equilibrio, incobrabilidad u overhead.

No requiere migración D1 ni cambios en `wrangler.jsonc`.
