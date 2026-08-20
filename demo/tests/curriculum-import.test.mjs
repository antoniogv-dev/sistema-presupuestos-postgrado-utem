import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { analyzeCurriculumMatrix } = await import(path.join(root, ".engine-build/lib/import/curriculum-file-import.js"));

const rows = [
  ["PLAN DE ESTUDIOS MAGISTER EN TERRITORIO"],
  ["Nivel (semestre)", "Código", "NOMBRE ASIGNATURA", "Duración en semanas", "Teoría", "Laboratorio", "Taller", "Horas trabajo directo", "Horas trabajo autónomo", "Total horas", "Total horas pedagógicas semestrales", "Total horas cronológicas semestrales", "SCT-Chile", "Requisitos"],
  [11, "", "Adquisición de datos geoespaciales", 18, 2, 0, 2, 4, 4, 8, 144, 108, 4, ""],
  [12, "", "Sensores remotos aplicados al territorio", 18, 2, 0, 2, 4, 4, 8, 144, 108, 4, ""],
  [23, "", "Electivo 1", 18, 2, 0, 2, 4, 4, 8, 144, 108, 4, ""],
  [41, "", "Proyecto de graduación", 18, 2, 0, 4, 6, 22, 28, 504, 378, 14, ""],
  [null, "HUMMX001", "Inglés", 18, 0, 0, 0, 0, 4, 4, 72, 54, 2, ""],
  [null, "FITMX001", "Empleabilidad y aprendizaje continuo", 18, 0, 0, 0, 0, 2, 2, 36, 27, 1, ""],
];

test("v10.26 reconoce la malla de los curriculistas y clasifica competencias genéricas", () => {
  const analysis = analyzeCurriculumMatrix(rows, "Plan de estudios");
  assert.ok(analysis, "la estructura curricular debe ser reconocida");
  assert.equal(analysis.courses.length, 6);
  assert.equal(analysis.courses[0].semester, 1);
  assert.equal(analysis.courses[2].semester, 2);
  assert.equal(analysis.courses[2].kind, "ELECTIVA");
  assert.equal(analysis.courses[2].sections, 1);
  assert.equal(analysis.courses[3].semester, 4);
  assert.equal(analysis.courses[3].directWeeklyHours, 6);
  assert.equal(analysis.courses[4].kind, "COMPETENCIA_GENERICA");
  assert.equal(analysis.courses[4].code, "HUMMX001");
  assert.equal(analysis.courses[4].directWeeklyHours, 0);
  assert.equal(analysis.courses[4].sctCredits, 2);
});
