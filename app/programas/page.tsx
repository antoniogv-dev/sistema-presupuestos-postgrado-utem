import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCLP } from "@/lib/calculations/currency";
import { programs } from "@/lib/demo-data";

const typeLabels = { DOCTORADO: "Doctorado", MAGISTER_ACADEMICO: "Magíster académico", MAGISTER_PROFESIONAL: "Magíster profesional", OTRO: "Otro" };

export default function ProgramsPage() {
  return <AppShell><PageHeader eyebrow="Maestro institucional" title="Programas de postgrado" description="Catálogo de programas, responsables, duración y centros de costo." actions={<button className="button primary">Agregar programa</button>} />
    <section className="panel"><div className="filter-bar"><label>Buscar programa<input type="search" placeholder="Código, nombre o director" /></label><label>Tipo<select><option>Todos</option><option>Doctorado</option><option>Magíster académico</option><option>Magíster profesional</option></select></label><label>Estado<select><option>Activos</option><option>Todos</option></select></label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Programa</th><th>Tipo</th><th>Facultad</th><th>Director</th><th>Duración</th><th className="numeric">Arancel 2027</th><th>Fuente</th><th>Estado</th></tr></thead><tbody>{programs.map((program) => <tr key={program.id}><th>{program.code}</th><td><strong>{program.name}</strong><small>{program.costCenter ? `Centro de costo ${program.costCenter}` : "Sin centro de costo registrado"}</small></td><td>{typeLabels[program.type]}</td><td>{program.faculty}</td><td>{program.director}</td><td>{program.officialDurationSemesters} semestres</td><td className="numeric">{formatCLP(program.annualTuition?.[2027] ?? 0)}</td><td>{program.tuitionSource === "PLANTILLA_DOCTORADO" ? "Plantilla doctorado" : "Propio"}</td><td><StatusBadge status={program.status} /></td></tr>)}</tbody></table></div>
    </section></AppShell>;
}
