# Cambios v10.17 - Compatibilidad XLSX

- Se corrigió la estructura OOXML de las hojas generadas.
- Se eliminó el `autoFilter` artesanal que estaba ubicado después de `mergeCells` en las hojas de parámetros.
- Se eliminó `pageSetup` artesanal del XLSX para reducir elementos opcionales susceptibles de reparación por Microsoft Excel.
- Se incorporó `sheetFormatPr` y una selección válida para los paneles congelados.
- Se agregó sanitización de caracteres de control incompatibles con XML 1.0 antes de escribir cualquier texto del usuario.
- Se mantiene la primera hoja `Presupuesto completo` con flujo y todos los parámetros completos debajo.
- Se mantiene la hoja independiente `Parámetros completos` y las vistas auxiliares.
- Se mantienen los subtotales de v10.16 y el PDF A4 vertical.
- Sin cambios D1.
