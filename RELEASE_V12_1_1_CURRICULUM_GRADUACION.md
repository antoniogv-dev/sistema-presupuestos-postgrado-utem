# Sistema de Presupuestos de Postgrado UTEM — v12.1.1

Versión técnica: `2.1.1-d1-web`.

Esta es una versión completa y acumulativa: incorpora todas las mejoras de la serie v12, la consolidación visual v12.1.0 y la mejora curricular v12.1.1.

## Mejora curricular

- Sólo las horas de docencia directa se incorporan a la carga y al costo presupuestario. Las horas autónomas no se aplican en el módulo presupuestario.
- Nuevo tipo de asignatura `GRADUACION` para Tesis I, Tesis II, AFE, Proyecto/Trabajo de Graduación y actividades formativas equivalentes.
- Electivos, asignaturas de especialización y asignaturas de graduación permiten múltiples secciones en la malla maestra.
- En Presupuestos, esas tres categorías permiten modificar el número de secciones para una cohorte sin alterar la malla maestra.
- Los ajustes de secciones por cohorte quedan persistidos en `curriculumSectionOverrides`.
- En Doctorado y Magíster Académico, una asignatura de graduación usa por defecto tantas secciones como estudiantes activos tenga el semestre correspondiente.
- Si el usuario define manualmente otra cantidad, el valor manual prevalece para esa cohorte.
- Si no hay estudiantes activos, el costo automático de la asignatura de graduación es cero.
- El importador de malla reconoce Tesis/AFE como asignaturas de graduación y descarta horas autónomas para el presupuesto.
- Las asignaturas asincrónicas continúan aplicando su factor únicamente sobre las horas directas y las secciones efectivamente presupuestadas.
- Las competencias genéricas continúan sin generar costo docente.

## Persistencia

Se incorpora la migración `0014_curriculum_graduation_section_overrides.sql`, que:

1. amplía `ProgramCourse.kind` con `GRADUACION`;
2. conserva las mallas existentes;
3. agrega `CohortBudget.curriculumSectionOverrides` para las secciones particulares de cada presupuesto.

## Pruebas

- Batería determinística específica: 12 reglas/escenarios de currículo, Tesis, AFE, secciones y horas directas.
- Simulación masiva: 2.500 cohortes con combinaciones aleatorias de tipo de programa, tipo de asignatura, estudiantes, secciones, modalidad y factor asincrónico.
- Suite funcional completa: 73/73 pruebas aprobadas.
- Preflight: 14 migraciones D1 reconocidas.
- Auditoría de aislamiento: 12/12.
- Auditoría SQL: 0 APIs raw inseguras y 3 interpolaciones estructurales controladas.
