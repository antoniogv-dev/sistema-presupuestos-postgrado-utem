import type { AccessRole, BudgetStatus, CohortBudget, ReviewDecision, ReviewEvent, WorkflowStage } from "../calculations/types";

export type WorkflowAction = "SUBMIT_VB" | "VB_APPROVE" | "VB_OBSERVE" | "FINAL_APPROVE" | "FINAL_OBSERVE";

export interface WorkflowTransition {
  action: WorkflowAction;
  requiredRole: AccessRole;
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  status: BudgetStatus;
  decision: ReviewDecision;
}

const TRANSITIONS: WorkflowTransition[] = [
  { action: "SUBMIT_VB", requiredRole: "GESTOR", fromStage: "GESTION", toStage: "VISTO_BUENO", status: "En revisión", decision: "ENVIADO" },
  { action: "VB_APPROVE", requiredRole: "VISTO_BUENO", fromStage: "VISTO_BUENO", toStage: "APROBACION", status: "En revisión", decision: "VISTO_BUENO" },
  { action: "VB_OBSERVE", requiredRole: "VISTO_BUENO", fromStage: "VISTO_BUENO", toStage: "GESTION", status: "Observado", decision: "OBSERVADO" },
  { action: "FINAL_APPROVE", requiredRole: "APROBADOR", fromStage: "APROBACION", toStage: "FINALIZADO", status: "Aprobado", decision: "APROBADO" },
  { action: "FINAL_OBSERVE", requiredRole: "APROBADOR", fromStage: "APROBACION", toStage: "GESTION", status: "Observado", decision: "RECHAZADO" },
];

export function availableWorkflowActions(stage: WorkflowStage, role: AccessRole): WorkflowTransition[] {
  return TRANSITIONS.filter((transition) => transition.fromStage === stage && transition.requiredRole === role);
}

export function canEditBudget(budget: CohortBudget, role: AccessRole): boolean {
  return role === "GESTOR" && budget.workflowStage === "GESTION" && budget.status !== "Aprobado";
}

export function canDeleteBudget(budget: CohortBudget, role: AccessRole): boolean {
  if (budget.status === "Aprobado") return role === "APROBADOR";
  return role === "GESTOR" && budget.workflowStage === "GESTION";
}

export function applyWorkflowAction(
  budget: CohortBudget,
  role: AccessRole,
  action: WorkflowAction,
  user: string,
  comment = "",
  now = new Date().toISOString(),
): CohortBudget {
  const transition = TRANSITIONS.find((candidate) => candidate.action === action);
  if (!transition) throw new Error("Acción de flujo desconocida.");
  if (transition.requiredRole !== role) throw new Error("El rol seleccionado no puede ejecutar esta acción.");
  if (transition.fromStage !== budget.workflowStage) throw new Error("La acción no corresponde a la etapa actual del presupuesto.");

  const event: ReviewEvent = {
    id: `review-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    decision: transition.decision,
    user,
    comment,
    createdAt: now,
    fromStage: budget.workflowStage,
    toStage: transition.toStage,
  };

  return {
    ...budget,
    status: transition.status,
    workflowStage: transition.toStage,
    updatedAt: now,
    reviewHistory: [...budget.reviewHistory, event],
  };
}
