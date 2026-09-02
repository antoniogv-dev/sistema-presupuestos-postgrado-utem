# Sistema de Presupuestos de Postgrado UTEM — v12.1.1

Versión técnica: `2.1.1-d1-web`.

## Alcance acumulativo

Esta entrega se construye sobre la v12.1.0 consolidada y conserva todas las mejoras funcionales incorporadas desde v12.0.0: ledger semestral, arancel total, modalidades de matrícula, descuentos, incobrabilidad, malla curricular, punto de equilibrio, planes anuales, exportaciones, workflow, consolidación, aislamiento entre presupuestos y auditoría SQL.

## Mejora curricular v12.1.1

1. **Sólo docencia directa**
   - Las horas autónomas dejan de formar parte de la formulación presupuestaria.
   - El importador puede reconocerlas en un archivo histórico, pero las persiste como 0 y no las valoriza.
   - Las horas docentes se construyen desde `Horas trabajo directo`; cuando falta ese total, se reconstruyen desde teoría + laboratorio + taller.

2. **Asignatura de graduación**
   - Nuevo tipo `GRADUACION`.
   - Incluye Tesis, Tesis I, Tesis II, Actividad Formativa Equivalente (AFE), Proyecto de Graduación, Trabajo de Grado y denominaciones equivalentes reconocidas por el importador.

3. **Secciones flexibles**
   - Obligatorias: una sección.
   - Competencias genéricas: una sección y sin costo docente.
   - Electivos: una o más secciones.
   - Especialización: una o más secciones.
   - Graduación/Tesis/AFE: una o más secciones.

4. **Secciones particulares en presupuesto**
   - Electivos, especialización y graduación pueden cambiar su número de secciones dentro de una cohorte sin alterar la malla maestra.
   - El override se persiste en `CohortBudget.courseSectionOverrides`.
   - El botón `Auto` elimina el override y recupera la regla por defecto.

5. **Tesis/AFE en programas académicos**
   - En Doctorados y Magísteres Académicos, una asignatura de graduación toma por defecto tantas secciones como estudiantes activos existan en ese semestre.
   - Si cambian los estudiantes activos y no existe override, las secciones y horas docentes se recalculan automáticamente.
   - El usuario puede fijar manualmente otra cantidad para la cohorte.

6. **Malla y carga**
   - Al aplicar la malla se recalculan horas presenciales, sincrónicas y asincrónicas.
   - El factor asincrónico se aplica después de semanas × secciones × horas directas.
   - Economías de escala utilizan las horas efectivas de la asignatura con sus secciones resueltas.

## Persistencia

Nueva migración D1:

`0014_curriculum_graduation_sections.sql`

Agrega el campo JSON `courseSectionOverrides` a `CohortBudget`. No modifica presupuestos existentes; el valor por defecto es `{}`.
