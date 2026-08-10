import type { ProgramType, TuitionSource } from "@/lib/calculations/types";

export function tuitionSourceForTemplate(type: ProgramType): TuitionSource {
  if (type === "DOCTORADO") return "PLANTILLA_DOCTORADO";
  if (type === "MAGISTER_ACADEMICO") return "PLANTILLA_MAGISTER_ACADEMICO";
  if (type === "MAGISTER_PROFESIONAL") return "PLANTILLA_MAGISTER_PROFESIONAL";
  return "PROPIO";
}

export function templateTypeFromTuitionSource(source: TuitionSource): ProgramType | null {
  if (source === "PLANTILLA_MAGISTER_ACADEMICO") return "MAGISTER_ACADEMICO";
  if (source === "PLANTILLA_MAGISTER_PROFESIONAL") return "MAGISTER_PROFESIONAL";
  if (source === "PLANTILLA_DOCTORADO") return "DOCTORADO";
  return null;
}

export function tuitionSourceFromDatabase(source: string, templateType?: ProgramType | null): TuitionSource {
  if (source === "PROPIO") return "PROPIO";
  if (!templateType) return "PLANTILLA_DOCTORADO";
  return tuitionSourceForTemplate(templateType);
}

export function tuitionSourceLabel(source: TuitionSource): string {
  switch (source) {
    case "PLANTILLA_DOCTORADO": return "Plantilla Doctoral";
    case "PLANTILLA_MAGISTER_ACADEMICO": return "Plantilla Magíster Académico";
    case "PLANTILLA_MAGISTER_PROFESIONAL": return "Plantilla Magíster Profesional";
    default: return "Arancel propio";
  }
}
