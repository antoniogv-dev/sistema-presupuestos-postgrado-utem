# Verificación técnica v10.26

## Pruebas ejecutadas y aprobadas

- `tsc -p tsconfig.engine.json`: correcto.
- Standalone combinado: **17/17 pruebas aprobadas**.
  - Factor asincrónico 50 %: correcto.
  - Asignatura compartida: correcto.
  - Competencia genérica fuera del flujo: correcto.
  - Importación de estructura curricular de curriculistas: correcta.
  - XLSX institucional mejorado con malla y fórmulas: correcto.
  - 12 pruebas históricas del motor: correctas.
- Migraciones SQLite secuenciales `0001 → 0010`: correctas.
- Restricción D1/SQLite: obligatoria con 2 secciones rechazada; electiva con 2 secciones aceptada.
- `preflight`: correcto, 10 migraciones detectadas.
- `source:audit`: correcto; sólo advertencias esperadas por marcadores temporales usados en la prueba local de configuración.
- `integrity:audit`: **12/12** controles aprobados.
- Plantilla XLSX del proyecto y archivo mejorado del usuario: SHA-256 idéntico `24e7b6a886161646d2db9ff9015d261ecaebdb86b6548bd292baddbd5d89853e`.

## Validación XLSX

La prueba preventiva comprueba:
- cinco hojas institucionales presentes;
- `styles.xml` y tema sin cambios respecto del modelo;
- estructura externa de cada hoja sin cambios;
- recálculo Excel activado;
- ausencia de `calcChain.xml` obsoleto;
- fórmulas institucionales sin `#REF!`, `#NAME?`, `#DIV/0!` ni `#VALUE!` incrustados;
- asignaturas obligatorias, asincrónicas, compartidas y competencias genéricas incorporadas;
- conciliación de costos de docencia e ingresos/egresos con el motor financiero.

## Limitación de validación local

Se intentó instalar la totalidad de dependencias npm para ejecutar `typecheck + lint + vitest + Next/OpenNext` localmente, pero `npm install` agotó el tiempo disponible del entorno. Por ello la validación integral de esas capas queda a cargo del pipeline de Cloudflare. El propio `quality:cloudflare` incluye ahora `test:institutional-xlsx` y `test:curriculum`, por lo que el despliegue fallará si estas nuevas funciones presentan una regresión.
