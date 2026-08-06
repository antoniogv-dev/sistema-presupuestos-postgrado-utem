"use client";

import { useEffect, useState } from "react";
import type { BudgetTemplate, BudgetTemplateItem, ProgramType, TemplateItemKind } from "@/lib/calculations/types";
import { defaultBudgetTemplates } from "@/lib/templates/default-templates";

const STORAGE_KEY = "utem-postgrado-budget-templates-v5";
const KINDS: TemplateItemKind[] = ["DESCUENTO","BECA_ARANCEL","BECA_MANUTENCION","COSTO","INGRESO_EXTRAORDINARIO"];
const TYPES: ProgramType[] = ["DOCTORADO","MAGISTER_ACADEMICO","MAGISTER_PROFESIONAL"];
const typeLabel = (type: ProgramType) => ({ DOCTORADO:"Doctorado", MAGISTER_ACADEMICO:"Magíster académico", MAGISTER_PROFESIONAL:"Magíster profesional", OTRO:"Otro" })[type];
const kindLabel = (kind: TemplateItemKind) => ({ DESCUENTO:"Descuento", BECA_ARANCEL:"Beca de excelencia académica (arancel)", BECA_MANUTENCION:"Beca de atención económica (manutención)", COSTO:"Costo o gasto", INGRESO_EXTRAORDINARIO:"Ingreso extraordinario" })[kind];
const uid = (prefix:string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
type ApiTemplateItem = Omit<BudgetTemplateItem, "key"> & {
  key?: string;
  itemKey?: string;
};

type ApiBudgetTemplate = Omit<BudgetTemplate, "description" | "items"> & {
  description?: string | null;
  items: ApiTemplateItem[];
};

function normalizeTemplate(record: ApiBudgetTemplate): BudgetTemplate {
  return {
    ...record,
    description: record.description ?? "",
    items: record.items.map((item) => {
      const { key, itemKey, ...rest } = item;
      return {
        ...rest,
        key: key ?? itemKey ?? uid("item"),
      };
    }),
  };
}
const defaultConfig = (kind:TemplateItemKind): Record<string,unknown> => ({
  DESCUENTO:{percentage:0,students:0,periodMode:"TODOS"},
  BECA_ARANCEL:{studentMode:"TODOS_ACTIVOS",students:0,coverage:1,periodMode:"TODOS"},
  BECA_MANUTENCION:{studentMode:"TODOS_ACTIVOS",students:0,months:0,periodMode:"TODOS"},
  COSTO:{category:"Otros",amount:0,costType:"Único de esta versión",periodicity:"Único"},
  INGRESO_EXTRAORDINARIO:{type:"Otro",students:1,amountPerStudent:0,source:"Plantilla"},
})[kind];

export function TemplateManager() {
  const [templates,setTemplates]=useState<BudgetTemplate[]>(defaultBudgetTemplates);
  const [activeType,setActiveType]=useState<ProgramType>("DOCTORADO");
  const [message,setMessage]=useState("");
  const template=templates.find((item)=>item.programType===activeType)??templates[0];
  useEffect(()=>{ fetch("/api/templates",{cache:"no-store"}).then(async(response)=>{if(!response.ok) throw new Error(); const records=await response.json() as ApiBudgetTemplate[]; setTemplates(records.map(normalizeTemplate));}).catch(()=>{try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)setTemplates(JSON.parse(saved));}catch{}});},[]);
  const replace=(next:BudgetTemplate)=>setTemplates((current)=>current.map((item)=>item.id===next.id?next:item));
  const updateItem=(index:number,field:keyof BudgetTemplateItem,value:unknown)=>replace({...template,items:template.items.map((item,candidate)=>candidate===index?{...item,[field]:value}:item)});
  const updateConfig=(index:number,key:string,value:unknown)=>replace({...template,items:template.items.map((item,candidate)=>candidate===index?{...item,config:{...(item.config as object),[key]:value}}:item)});
  async function save(){const payload={name:template.name,description:template.description,active:template.active,items:template.items.map((item,index)=>({...item,position:index,config:item.config}))};try{const response=await fetch(`/api/templates/${template.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});if(!response.ok)throw new Error();const saved=await response.json() as ApiBudgetTemplate;replace(normalizeTemplate(saved));setMessage("Plantilla actualizada en la base institucional.");}catch{const next={...template,version:template.version+1};replace(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(templates.map((item)=>item.id===next.id?next:item)));setMessage("Plantilla actualizada en modo local.");}}
  if(!template)return null;
  return <section className="panel template-manager"><div className="panel-header"><div><h2>Plantillas presupuestarias editables</h2><p>Los cambios sólo afectan nuevos usos o presupuestos donde se vuelva a aplicar la plantilla.</p></div><button className="button primary" type="button" onClick={save}>Guardar plantilla</button></div>{message?<div className="notice success">{message}</div>:null}<div className="parameter-tabs">{TYPES.map((type)=><button key={type} className={`tab-button ${activeType===type?"active":""}`} onClick={()=>setActiveType(type)}>{typeLabel(type)}</button>)}</div><div className="form-grid"><label>Nombre<input value={template.name} onChange={(event)=>replace({...template,name:event.target.value})}/></label><label className="span-2">Descripción<input value={template.description} onChange={(event)=>replace({...template,description:event.target.value})}/></label><label>Estado<select value={String(template.active)} onChange={(event)=>replace({...template,active:event.target.value==="true"})}><option value="true">Activa</option><option value="false">Inactiva</option></select></label></div><div className="template-toolbar"><span>Versión {template.version}</span><button className="button secondary" type="button" onClick={()=>{const kind:TemplateItemKind="DESCUENTO";replace({...template,items:[...template.items,{id:uid("template-item"),key:uid("item"),kind,name:kindLabel(kind),active:true,position:template.items.length,config:defaultConfig(kind)}]});}}>Agregar ítem</button></div><div className="template-items">{template.items.map((item,index)=><article className="template-item-card" key={item.id}><div className="template-item-head"><label>Nombre<input value={item.name} onChange={(event)=>updateItem(index,"name",event.target.value)}/></label><label>Tipo<select value={item.kind} onChange={(event)=>{const kind=event.target.value as TemplateItemKind;replace({...template,items:template.items.map((candidate,i)=>i===index?{...candidate,kind,name:kindLabel(kind),config:defaultConfig(kind)}:candidate)});}}>{KINDS.map((kind)=><option key={kind} value={kind}>{kindLabel(kind)}</option>)}</select></label><label className="compact-check"><input type="checkbox" checked={item.active} onChange={(event)=>updateItem(index,"active",event.target.checked)}/>Activo</label><button className="text-button danger-text" type="button" onClick={()=>replace({...template,items:template.items.filter((_,i)=>i!==index)})}>Quitar</button></div><TemplateConfig item={item} onChange={(key,value)=>updateConfig(index,key,value)}/></article>)}</div></section>;
}

function TemplateConfig({item,onChange}:{item:BudgetTemplateItem;onChange:(key:string,value:unknown)=>void}){const c=item.config as Record<string,unknown>;if(item.kind==="DESCUENTO")return <div className="template-item-config"><label>Porcentaje (%)<input type="number" min="0" max="100" value={Number(c.percentage??0)*100} onChange={(e)=>onChange("percentage",Number(e.target.value)/100)}/></label><label>Estudiantes<input type="number" min="0" value={Number(c.students??0)} onChange={(e)=>onChange("students",Number(e.target.value))}/></label></div>;if(item.kind==="BECA_ARANCEL")return <div className="template-item-config"><label>Estudiantes<select value={String(c.studentMode??"TODOS_ACTIVOS")} onChange={(e)=>onChange("studentMode",e.target.value)}><option value="TODOS_ACTIVOS">Todos los activos</option><option value="CANTIDAD">Cantidad definida</option></select></label><label>Cantidad<input type="number" min="0" value={Number(c.students??0)} onChange={(e)=>onChange("students",Number(e.target.value))}/></label><label>Cobertura (%)<input type="number" min="0" max="100" value={Number(c.coverage??1)*100} onChange={(e)=>onChange("coverage",Number(e.target.value)/100)}/></label></div>;if(item.kind==="BECA_MANUTENCION")return <div className="template-item-config"><label>Estudiantes<select value={String(c.studentMode??"TODOS_ACTIVOS")} onChange={(e)=>onChange("studentMode",e.target.value)}><option value="TODOS_ACTIVOS">Todos los activos</option><option value="CANTIDAD">Cantidad definida</option></select></label><label>Cantidad<input type="number" min="0" value={Number(c.students??0)} onChange={(e)=>onChange("students",Number(e.target.value))}/></label><label>Meses por semestre<input type="number" min="0" max="12" value={Number(c.months??0)} onChange={(e)=>onChange("months",Number(e.target.value))}/></label></div>;if(item.kind==="COSTO")return <div className="template-item-config"><label>Categoría<input value={String(c.category??"Otros")} onChange={(e)=>onChange("category",e.target.value)}/></label><label>Monto<input type="number" min="0" value={Number(c.amount??0)} onChange={(e)=>onChange("amount",Number(e.target.value))}/></label><label>Alcance<select value={String(c.costType??"Único de esta versión")} onChange={(e)=>onChange("costType",e.target.value)}><option>Único de esta versión</option><option>Compartido con otras cohortes</option></select></label></div>;return <div className="template-item-config"><label>Tipo<input value={String(c.type??"Otro")} onChange={(e)=>onChange("type",e.target.value)}/></label><label>Monto unitario<input type="number" min="0" value={Number(c.amountPerStudent??0)} onChange={(e)=>onChange("amountPerStudent",Number(e.target.value))}/></label><label>Estudiantes<input type="number" min="0" value={Number(c.students??1)} onChange={(e)=>onChange("students",Number(e.target.value))}/></label></div>;}
