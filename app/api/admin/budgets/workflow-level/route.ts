import { AccessLevel, BudgetStatus, WorkflowStage } from "@prisma/client";
import { z } from "zod";
import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const schema = z.object({
  budgetId: z.string().min(1),
  direction: z.enum(["UP", "DOWN"]),
  comment: z.string().trim().max(1000).optional(),
});

const STAGE_ORDER: WorkflowStage[] = [
  WorkflowStage.GESTION,
  WorkflowStage.VISTO_BUENO,
  WorkflowStage.APROBACION,
  WorkflowStage.FINALIZADO,
];

function statusForTarget(target: WorkflowStage): BudgetStatus {
  if (target === WorkflowStage.FINALIZADO) return BudgetStatus.APROBADO;
  if (target === WorkflowStage.GESTION) return BudgetStatus.OBSERVADO;
  return BudgetStatus.EN_REVISION;
}

function workflowRoleForTarget(target: WorkflowStage): AccessLevel {
  if (target === WorkflowStage.GESTION) return AccessLevel.GESTOR;
  if (target === WorkflowStage.VISTO_BUENO) return AccessLevel.VISTO_BUENO;
  return AccessLevel.APROBADOR;
}

function nextStage(current: WorkflowStage, direction: "UP" | "DOWN"): WorkflowStage | null {
  const index = STAGE_ORDER.indexOf(current);
  if (index < 0) return null;
  const targetIndex = direction === "UP" ? index + 1 : index - 1;
  return STAGE_ORDER[targetIndex] ?? null;
}

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    if (!identity.roles.includes("ADMIN")) throw new Error("FORBIDDEN");

    const input = schema.parse(await request.json());
    const prisma = getPrismaClient();
    const budget = await prisma.cohortBudget.findFirst({
      where: { id: input.budgetId, deletedAt: null },
      include: { versions: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!budget) throw new Error("NOT_FOUND");

    const targetStage = nextStage(budget.workflowStage, input.direction);
    if (!targetStage) {
      return Response.json({
        error: input.direction === "UP"
          ? "El presupuesto ya se encuentra en el nivel máximo del flujo."
          : "El presupuesto ya se encuentra en el nivel mínimo del flujo.",
      }, { status: 409 });
    }

    const targetStatus = statusForTarget(targetStage);
    const currentVersion = budget.versions[0];
    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        UPDATE "CohortBudget"
        SET "workflowStage" = ?, "status" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(targetStage, targetStatus, budget.id),
    ];

    if (currentVersion) {
      if (targetStage === WorkflowStage.FINALIZADO) {
        statements.push(
          database.prepare(`
            UPDATE "BudgetVersion"
            SET "status" = 'REEMPLAZADO'
            WHERE "budgetId" = ? AND "status" = 'APROBADO' AND "id" <> ?
          `).bind(budget.id, currentVersion.id),
        );
      }
      statements.push(
        database.prepare(`UPDATE "BudgetVersion" SET "status" = ? WHERE "id" = ?`)
          .bind(targetStatus, currentVersion.id),
      );
    }

    statements.push(
      database.prepare(`
        INSERT INTO "BudgetWorkflowEvent" (
          "id", "budgetId", "userId", "role", "action", "fromStage", "toStage", "comment", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("workflow"),
        budget.id,
        identity.userId,
        workflowRoleForTarget(targetStage),
        input.direction === "UP" ? "ADMIN_LEVEL_UP" : "ADMIN_LEVEL_DOWN",
        budget.workflowStage,
        targetStage,
        input.comment || "Cambio administrativo de nivel",
      ),
    );

    statements.push(
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "budgetId", "versionId", "entity", "entityId", "action",
          "previousValue", "newValue", "createdAt"
        ) VALUES (?, ?, ?, ?, 'CohortBudget', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("audit"),
        identity.userId,
        budget.id,
        currentVersion?.id ?? null,
        budget.id,
        input.direction === "UP" ? "ADMIN_LEVEL_UP" : "ADMIN_LEVEL_DOWN",
        d1Json({ status: budget.status, workflowStage: budget.workflowStage }),
        d1Json({
          status: targetStatus,
          workflowStage: targetStage,
          adminOverride: true,
          comment: input.comment || null,
        }),
      ),
    );

    await runD1Batch(statements);

    return Response.json({
      ok: true,
      budgetId: budget.id,
      previous: { status: budget.status, workflowStage: budget.workflowStage },
      current: { status: targetStatus, workflowStage: targetStage },
    });
  } catch (error) {
    return apiError(error);
  }
}
