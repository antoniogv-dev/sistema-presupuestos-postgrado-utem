"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { formatCLP, formatPercent } from "@/lib/calculations/currency";
import type { ProgramType } from "@/lib/calculations/types";
import { institutionalParameters } from "@/lib/demo-data";
import { TemplateManager } from "@/features/templates/components/TemplateManager";

const scopes: Array<{ type: ProgramType; label: string }> = [
  { type: "DOCTORADO", label: "Doctorado" },
  { type: "MAGISTER_ACADEMICO", label: "Magíster académico" },
  { type: "MAGISTER_PROFESIONAL", label: "Magíster profesional" },
];

export default function ParametersPage() {
  const [activeType, setActiveType] = useState<ProgramType>("DOCTORADO");
  const values = institutionalParameters.byProgramType[activeType];
  const years = Object.keys(institutionalParameters.doctorateTuitionTemplate).map(Number);
  const academic = activeType === "DOCTORADO" || activeType === "MAGISTER_ACADEMICO";

  return <AppShell><PageHeader eyebrow="Configuración institucional" title="Parámetros generales por tipo de programa" description="Separación explícita entre doctorados, magísteres académicos y magísteres profesionales." actions={<button className="button primary">Nueva vigencia</button>} />
    <TemplateManager />
    <section className="panel"><div className="panel-title"><div><h2>Parámetros generales comunes</h2><p>Valores compartidos que no dependen del tipo de programa.</p></div></div><div className="parameter-grid"><div className="parameter-item"><span>Hora docente de reemplazo</span><strong>{formatCLP(institutionalParameters.replacementHour)}</strong><small>Valor general</small></div><div className="parameter-item"><span>Reajuste anual</span><strong>{formatPercent(institutionalParameters.annualAdjustmentRate)}</strong><small>Referencia de proyección</small></div><div className="parameter-item"><span>Horizonte de planificación</span><strong>{institutionalParameters.planningHorizonYears} años</strong><small>Vista consolidada</small></div><div className="parameter-item"><span>Plantilla de arancel doctoral 2027</span><strong>{formatCLP(institutionalParameters.doctorateTuitionTemplate[2027])}</strong><small>Respaldo, no reemplaza el arancel propio</small></div></div></section>

    <section className="panel"><div className="panel-title"><div><h2>Parámetros por tipo de programa</h2><p>Seleccione el ámbito que desea revisar o modificar.</p></div></div><div className="parameter-tabs" role="tablist" aria-label="Tipo de programa">{scopes.map((scope) => <button className="button secondary" type="button" role="tab" aria-selected={activeType === scope.type} onClick={() => setActiveType(scope.type)} key={scope.type}>{scope.label}</button>)}</div>
      <div className="parameter-grid"><div className="parameter-item"><span>Overhead central</span><strong>{academic ? "No aplica" : formatPercent(values.centralOverheadRate)}</strong><small>{academic ? "Regla institucional" : "Ingreso neto por arancel"}</small></div><div className="parameter-item"><span>Overhead facultad</span><strong>{academic ? "No aplica" : formatPercent(values.facultyOverheadRate)}</strong><small>{academic ? "Regla institucional" : "Editable por presupuesto"}</small></div><div className="parameter-item"><span>Incobrabilidad</span><strong>{formatPercent(values.badDebtRate)}</strong><small>Después de descuentos y becas</small></div><div className="parameter-item"><span>Guía de tesis 2027</span><strong>{formatCLP(values.thesisGuidancePerGraduatingStudent[2027])}</strong><small>Por estudiante en graduación</small></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Parámetro</th>{years.map((year) => <th className="numeric" key={year}>{year}</th>)}</tr></thead><tbody>
        <ParameterRow name="Hora docente directa" years={years} values={institutionalParameters.teachingHour} />
        <ParameterRow name="Matrícula anual" years={years} values={institutionalParameters.annualEnrollmentFee} />
        <ParameterRow name="Dirección anual" years={years} values={values.annualDirection} />
        <ParameterRow name="Asistencia anual" years={years} values={values.annualAssistance} />
        <ParameterRow name="Gastos operacionales" years={years} values={values.referenceOperational} />
        <ParameterRow name="Software y licencias" years={years} values={values.softwareLicenses} />
        <ParameterRow name="Difusión y admisión" years={years} values={values.diffusionAdmission} />
        <ParameterRow name="Congresos y pasantías" years={years} values={values.congressesInternships} />
        <ParameterRow name="Guía de tesis por estudiante" years={years} values={values.thesisGuidancePerGraduatingStudent} />
      </tbody></table></div>
    </section>
  </AppShell>;
}

function ParameterRow({ name, years, values }: { name: string; years: number[]; values: Record<number, number> }) {
  return <tr><th>{name}</th>{years.map((year) => <td className="numeric" key={year}>{formatCLP(values[year] ?? 0)}</td>)}</tr>;
}
