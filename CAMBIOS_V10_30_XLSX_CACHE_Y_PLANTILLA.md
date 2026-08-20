# v10.30 — Corrección definitiva de plantilla XLSX institucional

Versión: 1.0.40-d1-web

## Diagnóstico
La v10.29 conservaba la plantilla mejorada incorporada desde v10.26, pero el navegador la solicitaba con la misma URL histórica y `cache: force-cache`. Una sesión que hubiera descargado antes la plantilla v10.25 podía reutilizar ese archivo antiguo, cuya hoja Parámetros termina en la fila 16 y no contiene B17/C17. El generador nuevo intenta escribir Otros honorarios no académicos en B17/C17, provocando el mensaje `La plantilla institucional no contiene la celda B17.`

Además, la compatibilidad del formato institucional estaba limitada a 12 asignaturas valorizables; en un Magíster Profesional con una malla algo mayor la descarga podía utilizar el exportador general anterior.

## Correcciones
- Nueva URL física y versionada: `/templates/presupuesto-profesional-formula-base-v10-30.xlsx`.
- La descarga usa `cache: no-store` y un query de versión.
- Se verifica SHA-256 antes de utilizar la plantilla. Sólo se acepta `24e7b6a886161646d2db9ff9015d261ecaebdb86b6548bd292baddbd5d89853e`, idéntico a la plantilla mejorada utilizada desde v10.26.
- El generador valida B17/C17 y otras celdas estructurales antes de escribir.
- Los Magísteres Profesionales nunca caen silenciosamente al XLSX general antiguo. Si una geometría no cabe en la plantilla, se informa explícitamente en pantalla.
- La capacidad de la hoja `Costo Directo de Docencia` sube de 12 a 13 asignaturas valorizables usando la fila 16 disponible en el modelo; las sumas se actualizan a `G4:G16` y `H4:H16`.
- Se mantiene la capacidad de hasta 3 competencias genéricas.

## Sin migraciones D1
No se agrega ninguna migración. Se mantienen 10 migraciones.
