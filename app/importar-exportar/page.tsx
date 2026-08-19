"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { calculateBudget, defaultAnnualOverrideForYear, overheadApplies, programTypeParameters } from "@/lib/calculations/budget-engine";
import { buildConsolidationGroups } from "@/lib/calculations/consolidation";
import { getActivePeriods, getActiveYears } from "@/lib/calculations/periods";
import type { BudgetAnnualOverride, CohortBudget, InstitutionalParameters, Program, SemesterParameters } from "@/lib/calculations/types";
import { institutionalParameters as fallbackParameters } from "@/lib/demo-data";
import { downloadAuditCsv, downloadBudgetPdf, downloadBudgetXlsx, downloadConsolidationCsv, downloadConsolidationXlsx } from "@/lib/export/download";
import { analyzeBudgetFile, type ImportedBudgetAnalysis } from "@/lib/import/budget-file-import";
import type { ApiBudgetRecord, ApiIdentity, ApiProgram } from "@/lib/mappers/budget-api";
import { responseBody, toBudget, toProgram } from "@/lib/mappers/budget-api";

const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeProgramMatch = (value: string | undefined) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function completeSemester(
  year: number,
  semester: 1 | 2,
  students: number,
  imported?: ImportedBudgetAnalysis["semesters"][number],
): SemesterParameters {
  return {
    year,
    semester,
    activeStudents: Math.max(0, Math.round(numberOr(imported?.activeStudents, students))),
    graduatingStudents: Math.max(0, Math.round(numberOr(imported?.graduatingStudents, 0))),
    directTeachingHours: Math.max(0, numberOr(imported?.directTeachingHours, 0)),
    synchronousTeachingHours: Math.max(0, numberOr(imported?.synchronousTeachingHours, 0)),
    asynchronousTeachingHours: Math.max(0, numberOr(imported?.asynchronousTeachingHours, 0)),
    replacementTeachingHours: Math.max(0, numberOr(imported?.replacementTeachingHours, 0)),
    electiveSubjects: Math.max(0, Math.round(numberOr(imported?.electiveSubjects, 0))),
    electiveSections: Math.max(0, Math.round(numberOr(imported?.electiveSections, 0))),
    specializedCourses: Math.max(0, Math.round(numberOr(imported?.specializedCourses, 0))),
    specializedSections: Math.max(0, Math.round(numberOr(imported?.specializedSections, 0))),
    internalTuitionScholarshipStudents: Math.max(0, Math.round(numberOr(imported?.internalTuitionScholarshipStudents, 0))),
    internalTuitionScholarshipCoverage: Math.min(1, Math.max(0, numberOr(imported?.internalTuitionScholarshipCoverage, 1))),
    maintenanceScholarshipStudents: Math.max(0, Math.round(numberOr(imported?.maintenanceScholarshipStudents, 0))),
    maintenanceScholarshipMonths: Math.max(0, Math.round(numberOr(imported?.maintenanceScholarshipMonths, 0))),
    notes: typeof imported?.notes === "string" ? imported.notes : "",
  };
}

function cleanAnnualPatch(value: ImportedBudgetAnalysis["annualValues"][number] | undefined): Partial<BudgetAnnualOverride> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => key !== "year" && typeof item === "number" && Number.isFinite(item))) as Partial<BudgetAnnualOverride>;
}

function prepareImportedBudget(
  analysis: ImportedBudgetAnalysis,
  program: Program,
  parameters: InstitutionalParameters,
) {
  const parameterYears = Object.keys(parameters.annualEnrollmentFee).map(Number).filter(Number.isFinite);
  const fallbackYear = program.type === "MAGISTER_PROFESIONAL" ? 2027 : Math.min(...parameterYears);
  const startYear = analysis.startYear ?? (Number.isFinite(fallbackYear) ? fallbackYear : new Date().getFullYear());
  const startSemester = analysis.startSemester ?? 1;
  const durationSemesters = Math.min(8, Math.max(2, Math.round(analysis.durationSemesters ?? program.officialDurationSemesters)));
  const initialStudents = Math.max(0, Math.round(analysis.initialStudents ?? 0));
  const periods = getActivePeriods(startYear, startSemester, durationSemesters);
  const years = getActiveYears(periods);
  const typeParameters = programTypeParameters(parameters, program.type);
  const facultyOverheadRate = overheadApplies(program.type) ? typeParameters.facultyOverheadRate : 0;

  const annualOverrides = years.map((year) => {
    const fallback = defaultAnnualOverrideForYear({ program, facultyOverheadRate }, parameters, year);
    const imported = analysis.annualValues.find((item) => item.year === year);
    let resolved = { ...fallback, ...cleanAnnualPatch(imported), year };
    if (program.type === "MAGISTER_PROFESIONAL") {
      resolved = {
        ...resolved,
        maintenanceScholarshipMonthlyValue: 0,
        ...(Number.isFinite(resolved.synchronousTeachingHourValue) && resolved.synchronousTeachingHourValue > 0
          ? { directTeachingHourValue: resolved.synchronousTeachingHourValue, asynchronousTeachingHourValue: resolved.synchronousTeachingHourValue }
          : {}),
      };
    }
    if (resolved.annualTuition <= 0) throw new Error(`${year}: no existe un arancel positivo en el archivo ni en el programa seleccionado.`);
    return resolved;
  });

  const semesters = periods.map((period) => completeSemester(
    period.year,
    period.semester,
    initialStudents,
    analysis.semesters.find((item) => item.year === period.year && item.semester === period.semester),
  ));

  return {
    program,
    cohortName: analysis.cohortName?.trim() || `${program.code} ${startYear}-${startSemester}S · importado`,
    startYear,
    startSemester,
    durationSemesters,
    initialStudents,
    facultyOverheadRate,
    enrollmentRecognitionRate: 0,
    programVersionLabel: analysis.programVersionLabel?.trim() || program.versionLabel || "1",
    scholarshipsEnabled: program.type !== "MAGISTER_PROFESIONAL",
    deliveryModality: analysis.deliveryModality ?? "PRESENCIAL",
    annualOverrides,
    semesters: program.type === "MAGISTER_PROFESIONAL" ? semesters.map((semester) => ({ ...semester, internalTuitionScholarshipStudents: 0, maintenanceScholarshipStudents: 0, maintenanceScholarshipMonths: 0 })) : semesters,
    discounts: analysis.discounts,
    externalIncome: analysis.externalIncome,
    items: analysis.costs,
  };
}

export default function ImportExportPage() {
  const [budgets, setBudgets] = useState<CohortBudget[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [parameters, setParameters] = useState<InstitutionalParameters>(() => structuredClone(fallbackParameters));
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<ImportedBudgetAnalysis | null>(null);
  const [importProgramId, setImportProgramId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [budgetRecords, parameterValues, programRecords, me] = await Promise.all([
        responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
        responseBody<InstitutionalParameters>(await fetch("/api/parameters", { cache: "no-store" })),
        responseBody<ApiProgram[]>(await fetch("/api/programs?includeInactive=1", { cache: "no-store" })),
        responseBody<ApiIdentity>(await fetch("/api/me", { cache: "no-store" })),
      ]);
      const mapped = budgetRecords.map(toBudget);
      const mappedPrograms = programRecords.map(toProgram);
      setBudgets(mapped);
      setPrograms(mappedPrograms);
      setIdentity(me);
      setParameters(parameterValues);
      setSelectedId((current) => current && mapped.some((item) => item.id === current) ? current : mapped[0]?.id ?? "");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible cargar la información de interoperabilidad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selected = budgets.find((budget) => budget.id === selectedId);
  const result = useMemo(() => selected ? calculateBudget(selected, parameters) : null, [selected, parameters]);
  const institutional = useMemo(() => buildConsolidationGroups(budgets, parameters).find((group) => group.id === "institutional-approved"), [budgets, parameters]);

  async function runExport(action: () => void | Promise<void>, success: string) {
    try {
      await action();
      setMessage(success);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible completar la exportación.");
    }
  }

  async function analyzeFile(file: File | null) {
    if (!file) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const next = await analyzeBudgetFile(file);
      setAnalysis(next);
      const importedCode = normalizeProgramMatch(next.programCode);
      const importedName = normalizeProgramMatch(next.programName);
      const byCode = importedCode ? programs.find((program) => normalizeProgramMatch(program.code) === importedCode) : undefined;
      const byName = importedName ? programs.find((program) => {
        const candidate = normalizeProgramMatch(program.name);
        return candidate === importedName || candidate.includes(importedName) || importedName.includes(candidate);
      }) : undefined;
      setImportProgramId((byCode ?? byName)?.id ?? programs[0]?.id ?? "");
      setMessage(`Archivo analizado localmente: ${next.recognized.length} variables reconocidas, confianza ${next.confidence} %. Revise la vista previa antes de crear el borrador.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible interpretar el archivo seleccionado.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function persistImportedBudget() {
    if (!analysis || !identity || !importProgramId) return;
    const program = programs.find((item) => item.id === importProgramId);
    if (!program) return;
    if (!window.confirm(`Se creará un nuevo presupuesto en estado Borrador para ${program.code}. El archivo original no se modifica. ¿Continuar?`)) return;
    setImporting(true);
    try {
      const prepared = prepareImportedBudget(analysis, program, parameters);
      const created = await responseBody<{ id: string }>(await fetch("/api/budgets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          cohortName: prepared.cohortName,
          startYear: prepared.startYear,
          startSemester: prepared.startSemester,
          durationSemesters: prepared.durationSemesters,
          initialStudents: prepared.initialStudents,
          facultyOverheadRate: prepared.facultyOverheadRate,
          enrollmentRecognitionRate: 0,
          programVersionLabel: prepared.programVersionLabel,
          scholarshipsEnabled: prepared.scholarshipsEnabled,
          deliveryModality: prepared.deliveryModality,
          annualOverrides: prepared.annualOverrides,
          authorizedInitialCarryover: 0,
          includeAuthorizedCarryover: true,
          normalizeSharedCosts: true,
          alertPotentialDuplicates: true,
          appliedTemplateId: null,
          appliedTemplateVersion: null,
          notes: `Importado desde archivo local: ${analysis.fileName}. Confianza de reconocimiento: ${analysis.confidence} %.`,
          responsibleId: identity.userId,
        }),
      }));

      await responseBody(await fetch(`/api/budgets/${created.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          cohortName: prepared.cohortName,
          startYear: prepared.startYear,
          startSemester: prepared.startSemester,
          durationSemesters: prepared.durationSemesters,
          initialStudents: prepared.initialStudents,
          facultyOverheadRate: prepared.facultyOverheadRate,
          enrollmentRecognitionRate: 0,
          programVersionLabel: prepared.programVersionLabel,
          scholarshipsEnabled: prepared.scholarshipsEnabled,
          deliveryModality: prepared.deliveryModality,
          annualOverrides: prepared.annualOverrides,
          authorizedInitialCarryover: 0,
          includeAuthorizedCarryover: true,
          normalizeSharedCosts: true,
          alertPotentialDuplicates: true,
          notes: `Importado desde ${analysis.fileName}. Revise los parámetros antes de enviar a V°B°.`,
          changeNote: `Importación controlada desde ${analysis.fileName}`,
          semesters: prepared.semesters.map((semester, position) => ({ ...semester, position })),
          discounts: prepared.discounts,
          externalIncome: prepared.externalIncome,
          items: prepared.items,
          sharedCourses: [],
        }),
      }));
      await load();
      setSelectedId(created.id);
      setMessage(`Presupuesto importado como Borrador. Se reconocieron ${analysis.recognized.length} variables; revise el nuevo presupuesto antes de guardarlo o enviarlo a flujo de aprobación.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No fue posible crear el presupuesto importado.");
    } finally {
      setImporting(false);
    }
  }

  return <AppShell>
    <PageHeader eyebrow="Interoperabilidad" title="Importar y exportar" description="Importación local con reconocimiento de variables y exportaciones desde los presupuestos almacenados en D1." />
    {message ? <div className="notice info"><p>{message}</p></div> : null}
    <div className="dashboard-grid import-export-grid">
      <section className="panel import-budget-panel">
        <div className="panel-title"><div><h2>Importar presupuesto</h2><p>Seleccione un archivo local. El sistema lo analiza en el navegador, identifica variables presupuestarias y sólo crea un Borrador después de su confirmación.</p></div></div>
        <div className="upload-zone active-upload-zone">
          <strong>Reconocimiento inteligente de presupuesto</strong>
          <p>Formatos habilitados: .xlsx, .xlsm, .csv y .json. Se reconocen exportaciones del sistema y planillas externas mediante etiquetas como arancel, matrícula, estudiantes, docencia, staff, overhead, descuentos, ingresos y costos.</p>
          <label className="button secondary file-picker">{analyzing ? "Analizando…" : "Buscar archivo local"}<input type="file" accept=".xlsx,.xlsm,.csv,.json" disabled={analyzing || importing} onChange={(event) => void analyzeFile(event.target.files?.[0] ?? null)} /></label>
          <small>El archivo no se envía a D1 durante el análisis. Primero se muestra una vista previa de lo reconocido.</small>
        </div>

        {analysis ? <div className="import-analysis">
          <div className="summary-grid import-summary-grid">
            <div><span>Archivo</span><strong>{analysis.fileName}</strong></div>
            <div><span>Confianza</span><strong>{analysis.confidence} %</strong></div>
            <div><span>Variables</span><strong>{analysis.recognized.length}</strong></div>
            <div><span>Hojas leídas</span><strong>{analysis.sheetNames.length}</strong></div>
          </div>
          <div className="form-grid cols-3">
            <label>Programa destino<select value={importProgramId} onChange={(event) => setImportProgramId(event.target.value)}><option value="">Seleccione</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}</select><small>{analysis.programCode || analysis.programName ? `Detectado: ${analysis.programCode ?? ""} ${analysis.programName ?? ""}` : "No identificado automáticamente; seleccione manualmente."}</small></label>
            <label>Cohorte detectada<div className="input-like">{analysis.cohortName || `${analysis.startYear ?? "?"}-${analysis.startSemester ?? "?"}S`}</div></label>
            <label>Estudiantes iniciales<div className="input-like">{analysis.initialStudents ?? "No identificado"}</div></label>
          </div>
          {analysis.warnings.length ? <div className="notice warning"><strong>Revisión requerida</strong><ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : <div className="notice success"><p>Los campos esenciales fueron identificados. De todas maneras, el presupuesto se crea como Borrador para revisión humana.</p></div>}
          <div className="table-wrap import-preview-table"><table className="data-table"><thead><tr><th>Variable reconocida</th><th>Periodo</th><th>Valor</th><th>Origen</th></tr></thead><tbody>{analysis.recognized.slice(0, 120).map((item, index) => <tr key={`${item.field}-${item.period}-${index}`}><td>{item.field}</td><td>{item.period}</td><td>{item.value}</td><td>{item.source}</td></tr>)}</tbody></table></div>
          {analysis.recognized.length > 120 ? <p className="muted">Se muestran las primeras 120 variables de {analysis.recognized.length} reconocidas.</p> : null}
          <div className="workspace-actions"><button className="button primary" type="button" disabled={importing || !importProgramId || !identity} onClick={() => void persistImportedBudget()}>{importing ? "Creando borrador…" : "Crear presupuesto importado"}</button><button className="button secondary" type="button" disabled={importing} onClick={() => { setAnalysis(null); setImportProgramId(""); }}>Descartar análisis</button></div>
        </div> : null}

        <div className="notice info"><strong>Reconocimiento adaptable</strong><p>El motor usa nombres y estructura de las hojas, no una única posición fija de celdas. El presupuesto de ejemplo que usted suba servirá para ampliar los alias y reglas específicas sin cambiar este flujo de importación.</p></div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Exportaciones</h2><p>Seleccione un presupuesto para exportar su flujo individual o auditoría.</p></div></div>
        <label>Presupuesto<select value={selectedId} disabled={loading || !budgets.length} onChange={(event) => setSelectedId(event.target.value)}><option value="">Seleccione</option>{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.program.code} · {budget.cohortName} · Versión {budget.programVersionLabel} · R{budget.version}</option>)}</select></label>
        <div className="export-list enabled-exports">
          <button type="button" disabled={!selected || !result} onClick={() => selected && result && void runExport(() => downloadBudgetXlsx(selected, result, parameters), "Flujo individual exportado a Excel.")}><span><strong>Flujo individual</strong><small>Excel (.xlsx) con flujo y parámetros completos</small></span><span>Exportar XLSX</span></button>
          <button type="button" disabled={!selected || !result} onClick={() => selected && result && void runExport(() => downloadBudgetPdf(selected, result, parameters), "Reporte de viabilidad exportado a PDF.")}><span><strong>Reporte de viabilidad</strong><small>PDF con portada institucional, flujo, análisis financiero y parámetros</small></span><span>Exportar PDF</span></button>
          <button type="button" disabled={!institutional?.rows.length} onClick={() => institutional && void runExport(() => downloadConsolidationXlsx(institutional), "Consolidado institucional aprobado exportado a Excel.")}><span><strong>Consolidado institucional aprobado</strong><small>Incluye únicamente presupuestos aprobados</small></span><span>Exportar XLSX</span></button>
          <button type="button" disabled={!institutional?.rows.length} onClick={() => institutional && void runExport(() => downloadConsolidationCsv(institutional), "Consolidado institucional aprobado exportado a CSV.")}><span><strong>Consolidado institucional · datos</strong><small>CSV por año para análisis complementario</small></span><span>Exportar CSV</span></button>
          <button type="button" disabled={!selected} onClick={() => selected && void runExport(() => downloadAuditCsv(selected), "Detalle de auditoría exportado a CSV.")}><span><strong>Detalle de auditoría</strong><small>CSV de revisiones y cambios de flujo</small></span><span>Exportar CSV</span></button>
        </div>
      </section>
    </div>
  </AppShell>;
}
