-- v12.1.1 · Malla curricular: asignaturas de graduación y secciones particulares por cohorte.
-- CurriculumCourseKind es representado como TEXT en SQLite, por lo que GRADUACION no requiere ALTER TYPE.
ALTER TABLE "CohortBudget" ADD COLUMN "courseSectionOverrides" TEXT NOT NULL DEFAULT '{}';
