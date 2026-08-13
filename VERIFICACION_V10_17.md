# Verificación v10.17

## Problema reproducido

El XLSX v10.16 generado por el proyecto contenía `autoFilter` después de `mergeCells` en las hojas de parámetros y elementos de página artesanales. Microsoft Excel reportaba que reemplazaba `xl/worksheets/sheet*.xml`, dejando el flujo pero perdiendo el contenido de parámetros.

## Correcciones verificadas

- `autoFilter` artesanal eliminado de las 7 hojas.
- `pageSetup` artesanal eliminado del XLSX.
- `sheetFormatPr` agregado a todas las hojas.
- selección válida agregada junto al panel congelado.
- sanitización XML 1.0 agregada para textos provenientes del usuario.
- primera hoja mantiene `PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO`.
- hoja `Parámetros completos` conserva todos los registros.

## Pruebas ejecutadas

- TypeScript aislado de `lib/export/xlsx.ts`: correcto.
- `source:audit`: correcto; sólo advertencias esperables por placeholders usados exclusivamente durante la verificación local.
- Generación real de `V10_17_EXCEL_COMPATIBLE_TEST.xlsx`: correcta.
- Reapertura del XLSX con el motor de inspección de spreadsheets: 7 hojas detectadas y contenido de parámetros presente.
- Primera hoja: parámetros visibles debajo del flujo.
- Hoja `Parámetros completos`: parámetros y valores visibles.
- Sanitización probada con carácter de control XML: `ABC\u000BDEF` se exportó como `ABCDEF` sin corromper la hoja.
- Búsqueda de errores `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`: 0 coincidencias.

No hay migraciones D1 nuevas.
