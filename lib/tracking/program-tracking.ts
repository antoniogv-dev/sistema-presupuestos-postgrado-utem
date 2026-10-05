import type { ProgramType } from "@/lib/calculations/types";

export const academicStatusLabels = {
  NO_RECIBIDO: "No recibido",
  RECIBIDO: "Recibido",
  ENVIADO: "Enviado",
  OBSERVADO: "Observado",
  CONFORME: "Conforme",
} as const;

export const budgetStageLabels = {
  NO_INICIADO: "No iniciado",
  EN_ELABORACION: "En elaboración",
  LISTO: "Listo",
  REVISION_DIRECCION: "Revisión Dirección",
  REVISION_COMITE: "En revisión Comité",
  REVISION_VRAF: "En revisión VRAF",
  OBSERVADO: "Observado",
  EN_ACTUALIZACION: "En actualización",
  PASA_FIRMA: "Pasa a firma",
  APROBADO: "Aprobado",
  NO_APLICA: "No aplica",
} as const;

export const priorityLabels = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
} as const;

export type AcademicStatus = keyof typeof academicStatusLabels;
export type BudgetStage = keyof typeof budgetStageLabels;
export type TrackingPriority = keyof typeof priorityLabels;

export type ProgramTrackingSnapshot = {
  academicStatus: AcademicStatus;
  budgetStage: BudgetStage;
  priority: TrackingPriority;
  note: string;
  responsible: string;
  memoNumber: string;
  approvalDate: string;
  approvalUrl: string;
};

export type ProgramTrackingRecord = ProgramTrackingSnapshot & {
  programId: string;
  code: string;
  name: string;
  type: ProgramType;
  faculty: string;
  director: string;
  currentCohort: string;
  latestBudgetStatus: string | null;
  latestWorkflowStage: string | null;
  updatedAt: string;
  updatedByName: string;
};

export const emptyTrackingSnapshot: ProgramTrackingSnapshot = {
  academicStatus: "NO_RECIBIDO",
  budgetStage: "NO_INICIADO",
  priority: "MEDIA",
  note: "",
  responsible: "",
  memoNumber: "",
  approvalDate: "",
  approvalUrl: "",
};

export function fallbackBudgetStage(status?: string | null, workflowStage?: string | null): BudgetStage {
  if (status === "APROBADO") return "APROBADO";
  if (status === "OBSERVADO") return "OBSERVADO";
  if (status === "EN_REVISION") {
    if (workflowStage === "APROBACION") return "REVISION_VRAF";
    if (workflowStage === "VISTO_BUENO") return "REVISION_COMITE";
    return "REVISION_DIRECCION";
  }
  if (status === "BORRADOR") return "EN_ELABORACION";
  return "NO_INICIADO";
}

export function normalizeTrackingSnapshot(
  value: Partial<ProgramTrackingSnapshot> | null | undefined,
  fallbackStage: BudgetStage = "NO_INICIADO",
): ProgramTrackingSnapshot {
  return {
    academicStatus: value?.academicStatus && value.academicStatus in academicStatusLabels ? value.academicStatus : "NO_RECIBIDO",
    budgetStage: value?.budgetStage && value.budgetStage in budgetStageLabels ? value.budgetStage : fallbackStage,
    priority: value?.priority && value.priority in priorityLabels ? value.priority : "MEDIA",
    note: String(value?.note ?? ""),
    responsible: String(value?.responsible ?? ""),
    memoNumber: String(value?.memoNumber ?? ""),
    approvalDate: String(value?.approvalDate ?? ""),
    approvalUrl: String(value?.approvalUrl ?? ""),
  };
}

export function trackingSummary(records: ProgramTrackingRecord[]) {
  return {
    total: records.length,
    approved: records.filter((record) => record.budgetStage === "APROBADO").length,
    vraf: records.filter((record) => record.budgetStage === "REVISION_VRAF").length,
    drafting: records.filter((record) => record.budgetStage === "EN_ELABORACION" || record.budgetStage === "NO_INICIADO").length,
    observed: records.filter((record) => record.budgetStage === "OBSERVADO" || record.academicStatus === "OBSERVADO").length,
  };
}
