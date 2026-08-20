"use client";

import { useRef, useState } from "react";
import type { CurriculumCourseKind, ProgramCourse, TeachingMode } from "@/lib/calculations/types";
import type { ApiProgram } from "@/lib/mappers/budget-api";
import { analyzeCurriculumFile } from "@/lib/import/curriculum-file-import";

const kindLabels: Record<CurriculumCourseKind, string> = {
  OBLIGATORIA: "Obligatoria",
  ELECTIVA: "Electivo",
  ESPECIALIZACION: "Especialización",
  COMPETENCIA_GENERICA: "Competencia genérica",
};
const uid = () => `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function emptyCourse(kind: CurriculumCourseKind, position: number): ProgramCourse {
  return {
    id: uid(), code: "", name: kind === "COMPETENCIA_GENERICA" ? "Nueva competencia genérica" : "Nueva asignatura",
    semester: 1, kind, weeks: 18, sections: 1,
    theoryWeeklyHours: 0, laboratoryWeeklyHours: 0, workshopWeeklyHours: 0, directWeeklyHours: 0, autonomousWeeklyHours: 0,
    teachingMode: "SINCRONICA", asynchronousRateFactor: 0.5, sharedWithProgramIds: [], allocationRate: 1, sctCredits: 0, prerequisites: "", position,
  };
}

export function CurriculumEditor({
  courses, programs, currentProgramId, durationSemesters, onChange, onMessage,
}: {
  courses: ProgramCourse[];
  programs: ApiProgram[];
  currentProgramId?: string;
  durationSemesters: number;
  onChange: (courses: ProgramCourse[]) => void;
  onMessage: (message: string, error?: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  function update(index: number, patch: Partial<ProgramCourse>, recomputeDirect = false) {
    onChange(courses.map((course, i) => {
      if (i !== index) return course;
      const next = { ...course, ...patch };
      if (recomputeDirect) next.directWeeklyHours = next.theoryWeeklyHours + next.laboratoryWeeklyHours + next.workshopWeeklyHours;
      if (next.kind === "OBLIGATORIA" || next.kind === "COMPETENCIA_GENERICA") next.sections = 1;
      if (next.kind === "COMPETENCIA_GENERICA") { next.sharedWithProgramIds = []; next.allocationRate = 1; }
      return next;
    }));
  }
  function remove(index: number) { onChange(courses.filter((_, i) => i !== index).map((course, position) => ({ ...course, position }))); }
  function add(kind: CurriculumCourseKind) { onChange([...courses, emptyCourse(kind, courses.length)]); }

  async function importFile(file: File) {
    setImporting(true);
    try {
      const analysis = await analyzeCurriculumFile(file);
      if (courses.length && !window.confirm(`Se detectaron ${analysis.courses.length} registros en “${analysis.sheetName}”. ¿Reemplazar la malla actualmente editada?`)) return;
      const imported = analysis.courses.map((course, position) => ({ ...course, id: uid(), position }));
      onChange(imported);
      onMessage(`Malla importada: ${imported.length} registros · confianza ${Math.round(analysis.confidence * 100)}%. ${analysis.warnings.join(" ")}`.trim());
    } catch (reason) {
      onMessage(reason instanceof Error ? reason.message : "No fue posible importar la malla curricular.", true);
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const payable = courses.filter((course) => course.kind !== "COMPETENCIA_GENERICA");
  const generic = courses.filter((course) => course.kind === "COMPETENCIA_GENERICA");
  const totalSct = courses.reduce((sum, course) => sum + Math.max(0, course.sctCredits), 0);

  return <div className="curriculum-editor">
    <div className="panel-title curriculum-title">
      <div><h3>Malla curricular</h3><p>La malla forma parte del maestro del programa y puede utilizarse para construir la carga docente de los presupuestos.</p></div>
      <div className="curriculum-actions">
        <input ref={fileRef} hidden type="file" accept=".xlsx,.xlsm,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
        <button className="button secondary" type="button" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? "Importando…" : "Importar malla Excel"}</button>
        <button className="button secondary" type="button" onClick={() => add("OBLIGATORIA")}>+ Obligatoria</button>
        <button className="button secondary" type="button" onClick={() => add("ELECTIVA")}>+ Electivo</button>
        <button className="button secondary" type="button" onClick={() => add("ESPECIALIZACION")}>+ Especialización</button>
        <button className="button secondary" type="button" onClick={() => add("COMPETENCIA_GENERICA")}>+ Competencia genérica</button>
      </div>
    </div>
    <div className="curriculum-summary"><strong>{payable.length}</strong> asignaturas valorizables · <strong>{generic.length}</strong> competencias genéricas · <strong>{totalSct.toLocaleString("es-CL")}</strong> SCT registrados</div>
    {!courses.length ? <div className="notice warning"><strong>Malla requerida</strong><p>Para crear un programa nuevo debe incorporar al menos una asignatura o competencia genérica, manualmente o mediante importación.</p></div> : null}
    <div className="table-wrap curriculum-table-wrap"><table className="data-table curriculum-table"><thead><tr>
      <th>Sem.</th><th>Código</th><th>Asignatura</th><th>Tipo</th><th>Semanas</th><th>Secciones</th><th>Teoría</th><th>Lab.</th><th>Taller</th><th>Trabajo directo</th><th>Autónomo</th><th>Total semanal</th><th>Horas pedagógicas</th><th>Horas cronológicas</th><th>SCT</th><th>Docencia</th><th>Factor async.</th><th>Compartida con</th><th>% imputado</th><th>Requisitos</th><th>Acción</th>
    </tr></thead><tbody>{courses.length ? courses.map((course, index) => {
      const totalWeekly = course.directWeeklyHours + course.autonomousWeeklyHours;
      const pedagogical = totalWeekly * course.weeks;
      const chronological = pedagogical * 0.75;
      const effectiveDirect = course.kind === "COMPETENCIA_GENERICA" ? 0 : course.directWeeklyHours * (course.teachingMode === "ASINCRONICA" ? course.asynchronousRateFactor : 1);
      return <tr key={course.id} className={course.kind === "COMPETENCIA_GENERICA" ? "curriculum-generic-row" : ""}>
        <td><input aria-label={`Semestre ${index + 1}`} type="number" min="1" max={Math.max(16, durationSemesters)} value={course.semester} onChange={(event) => update(index, { semester: Number(event.target.value) || 1 })} /></td>
        <td><input aria-label={`Código ${index + 1}`} value={course.code ?? ""} onChange={(event) => update(index, { code: event.target.value.toUpperCase() })} /></td>
        <td className="curriculum-name"><input aria-label={`Asignatura ${index + 1}`} value={course.name} onChange={(event) => update(index, { name: event.target.value })} /><small>{course.kind !== "COMPETENCIA_GENERICA" ? `Horas docentes pagables equivalentes/semana: ${effectiveDirect.toLocaleString("es-CL", { maximumFractionDigits: 2 })}` : "No se incorpora al flujo financiero"}</small></td>
        <td><select value={course.kind} onChange={(event) => update(index, { kind: event.target.value as CurriculumCourseKind })}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
        <td><input type="number" min="1" max="30" value={course.weeks} onChange={(event) => update(index, { weeks: Number(event.target.value) || 18 })} /></td>
        <td><input type="number" min="1" max="20" value={course.sections} disabled={course.kind === "OBLIGATORIA" || course.kind === "COMPETENCIA_GENERICA"} onChange={(event) => update(index, { sections: Math.max(1, Number(event.target.value) || 1) })} /></td>
        <td><input type="number" min="0" step="0.5" value={course.theoryWeeklyHours} onChange={(event) => update(index, { theoryWeeklyHours: Number(event.target.value) || 0 }, true)} /></td>
        <td><input type="number" min="0" step="0.5" value={course.laboratoryWeeklyHours} onChange={(event) => update(index, { laboratoryWeeklyHours: Number(event.target.value) || 0 }, true)} /></td>
        <td><input type="number" min="0" step="0.5" value={course.workshopWeeklyHours} onChange={(event) => update(index, { workshopWeeklyHours: Number(event.target.value) || 0 }, true)} /></td>
        <td><input type="number" min="0" step="0.5" value={course.directWeeklyHours} onChange={(event) => update(index, { directWeeklyHours: Number(event.target.value) || 0 })} /></td>
        <td><input type="number" min="0" step="0.5" value={course.autonomousWeeklyHours} onChange={(event) => update(index, { autonomousWeeklyHours: Number(event.target.value) || 0 })} /></td>
        <td className="numeric">{totalWeekly.toLocaleString("es-CL")}</td><td className="numeric">{pedagogical.toLocaleString("es-CL")}</td><td className="numeric">{chronological.toLocaleString("es-CL")}</td>
        <td><input type="number" min="0" step="0.5" value={course.sctCredits} onChange={(event) => update(index, { sctCredits: Number(event.target.value) || 0 })} /></td>
        <td><select disabled={course.kind === "COMPETENCIA_GENERICA"} value={course.teachingMode} onChange={(event) => update(index, { teachingMode: event.target.value as TeachingMode })}><option value="SINCRONICA">Sincrónica</option><option value="ASINCRONICA">Asincrónica</option><option value="PRESENCIAL">Presencial</option></select></td>
        <td><div className="percent-input"><input disabled={course.kind === "COMPETENCIA_GENERICA" || course.teachingMode !== "ASINCRONICA"} type="number" min="0" max="100" step="1" value={(course.asynchronousRateFactor * 100).toFixed(0)} onChange={(event) => update(index, { asynchronousRateFactor: Math.min(1, Math.max(0, Number(event.target.value) / 100)) })} /><span>%</span></div></td>
        <td><select multiple disabled={course.kind === "COMPETENCIA_GENERICA"} value={course.sharedWithProgramIds} onChange={(event) => { const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value); const participants = 1 + values.length; update(index, { sharedWithProgramIds: values, allocationRate: participants > 1 ? 1 / participants : 1 }); }}>{programs.filter((program) => program.id !== currentProgramId && program.status !== "INACTIVO").map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}</select></td>
        <td><div className="percent-input"><input disabled={course.kind === "COMPETENCIA_GENERICA"} type="number" min="0" max="100" step="0.1" value={(course.allocationRate * 100).toFixed(1)} onChange={(event) => update(index, { allocationRate: Math.min(1, Math.max(0, Number(event.target.value) / 100)) })} /><span>%</span></div></td>
        <td><input value={course.prerequisites ?? ""} onChange={(event) => update(index, { prerequisites: event.target.value })} /></td>
        <td><button className="text-button danger-text" type="button" onClick={() => remove(index)}>Quitar</button></td>
      </tr>;
    }) : <tr><td colSpan={21}>No se han incorporado asignaturas.</td></tr>}</tbody></table></div>
    <div className="notice info"><strong>Regla curricular y financiera</strong><p>Las asignaturas obligatorias trabajan con una sección. Electivos y cursos de especialización pueden registrar varias secciones. Las competencias genéricas se registran en la malla y en el Excel, pero no generan costo docente. Las asignaturas asincrónicas valorizan sus horas directas con el factor indicado; por ejemplo, 50% sobre una hora base de $30.000 equivale a $15.000 por hora. Las asignaturas compartidas distribuyen el costo según el porcentaje imputado.</p></div>
  </div>;
}
