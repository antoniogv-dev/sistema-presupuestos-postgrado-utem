import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function ImportExportPage() {
  return <AppShell><PageHeader eyebrow="Interoperabilidad" title="Importar y exportar" description="Intercambio de información con planillas institucionales y reportes formales." />
    <div className="dashboard-grid"><section className="panel"><div className="panel-title"><div><h2>Importar presupuesto</h2><p>Cargue una planilla Excel para validación previa.</p></div></div><div className="upload-zone"><strong>Seleccione o arrastre un archivo</strong><p>Formatos preparados: .xlsx y .csv</p><button className="button primary">Seleccionar archivo</button></div><div className="notice info"><strong>Control previo</strong><p>La importación futura mostrará diferencias de columnas, tipos y fórmulas antes de guardar.</p></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Exportaciones</h2><p>Reportes disponibles desde la arquitectura actual.</p></div></div><div className="export-list"><button><span><strong>Flujo individual</strong><small>Excel con detalle de fórmulas</small></span><span>Preparado</span></button><button><span><strong>Consolidado institucional</strong><small>Excel o CSV por año</small></span><span>Preparado</span></button><button><span><strong>Reporte de viabilidad</strong><small>PDF con resultado y advertencias</small></span><span>Preparado</span></button><button><span><strong>Detalle de auditoría</strong><small>CSV de versiones y cambios</small></span><span>Preparado</span></button></div></section></div>
  </AppShell>;
}
