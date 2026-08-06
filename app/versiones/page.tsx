import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

const versions = [
  { marker: "A", status: "Aprobado", date: "04-08-2026", user: "Dirección de Postgrado", change: "Aprobación final de la versión presupuestaria." },
  { marker: "VB", status: "En revisión", date: "03-08-2026", user: "Revisión técnica", change: "Visto bueno técnico y derivación a aprobación." },
  { marker: "G", status: "Borrador", date: "02-08-2026", user: "M. Antonio Gutiérrez Varas", change: "Creación y envío del presupuesto a visto bueno." },
];

export default function VersionsPage() {
  return <AppShell><PageHeader eyebrow="Trazabilidad" title="Versiones, visto bueno y aprobación" description="Historial inmutable de las acciones ejecutadas por cada nivel de acceso." />
    <section className="panel"><div className="panel-title"><div><h2>Circuito de revisión</h2><p>Gestor → V°B° → Aprobación.</p></div><button className="button secondary">Comparar versiones</button></div><div className="timeline">{versions.map((entry, index) => <article key={`${entry.marker}-${index}`}><div className="timeline-marker">{entry.marker}</div><div className="timeline-content"><div><StatusBadge status={entry.status} /><time>{entry.date}</time></div><h3>{entry.change}</h3><p>Registrado por {entry.user}</p></div></article>)}</div></section>
    <section className="panel"><div className="panel-title"><div><h2>Reglas de control</h2><p>Protecciones aplicadas a las versiones y eliminaciones.</p></div></div><div className="explanation-grid"><div><strong>Aprobado inmutable</strong><p>Todo ajuste requiere una nueva versión.</p></div><div><strong>Eliminación lógica</strong><p>Los registros eliminados permanecen auditables en base de datos.</p></div><div><strong>Auditoría completa</strong><p>Usuario, rol, etapa, fecha, comentario y valores modificados.</p></div></div></section>
  </AppShell>;
}
