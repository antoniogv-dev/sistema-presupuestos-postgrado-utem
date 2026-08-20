# Verificación técnica v10.27

## Correcciones verificadas

- La aplicación de malla usa la última versión persistida del programa mediante `/api/programs/[programId]` con `cache: no-store`.
- Una asignatura sincrónica se mantiene valorizable aunque la modalidad global de la cohorte sea Presencial.
- Las tres bolsas de horas quedan visibles cuando existe malla curricular.
- El factor asincrónico de v10.26 continúa vigente.
- Estudiantes iniciales se replica en activos y en graduación del último semestre.
- La regeneración de periodos conserva cantidades activas ajustadas manualmente y sólo sincroniza la graduación final.
- Un descuento nuevo termina por defecto en el último semestre de la cohorte.
- `Sugerir equilibrio` aplica primero la malla y luego calcula el punto de equilibrio sin alterar automáticamente el número de estudiantes.

## Pruebas ejecutadas

- Compilación estricta del motor (`tsc -p tsconfig.engine.json`): OK.
- Pruebas curriculares y defaults standalone: 8/8 OK.
- Pruebas históricas standalone del motor: 12/12 OK.
- Preflight con configuración placeholder controlada: OK, 10 migraciones detectadas.
- Source audit: OK.
- Auditoría transversal: 12/12 OK.
- Parseo sintáctico TypeScript/TSX de BudgetWorkspace y CurriculumEditor: OK.

## Limitación de validación local

No se completó `npm install` dentro del tiempo disponible del entorno, por lo que el `typecheck`, `vitest`, `lint` y build OpenNext integrales quedan como validación final del pipeline de Cloudflare. El pipeline incorpora ahora `test:form-defaults` para estas reglas nuevas.

## D1

No hay migración nueva. Se mantiene `0010_program_curriculum.sql` de v10.26.
