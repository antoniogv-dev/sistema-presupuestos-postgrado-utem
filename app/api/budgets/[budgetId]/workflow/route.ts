import { ApprovalDecision, ApprovalLevel, BudgetStatus, WorkflowStage } from "@prisma/client";
import { z } from "zod";
import { apiError, hasAccess, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Id, d1Json, runD1Batch } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";
import { d1Database } from "@/lib/runtime-env";

const schema = z.object({
  action: z.enum(["SUBMIT_VB", "VB_APPROVE", "VB_OBSERVE", "FINAL_APPROVE", "FINAL_OBSERVE"]),
  comment: z.string().max(2000).optional(),
});

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

const transitions = {
  SUBMIT_VB: { role: "GESTOR", from: "GESTION", to: "VISTO_BUENO", status: BudgetStatus.EN_REVISION },
  VB_APPROVE: { role: "VISTO_BUENO", from: "VISTO_BUENO", to: "APROBACION", status: BudgetStatus.EN_REVISION },
  VB_OBSERVE: { role: "VISTO_BUENO", from: "VISTO_BUENO", to: "GESTION", status: BudgetStatus.OBSERVADO },
  FINAL_APPROVE: { role: "APROBADOR", from: "APROBACION", to: "FINALIZADO", status: BudgetStatus.APROBADO },
  FINAL_OBSERVE: { role: "APROBADOR", from: "APROBACION", to: "GESTION", status: BudgetStatus.OBSERVADO },
} as const;

export async function POST(request: Request, context: { params: Promise<{ budgetId: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    const { budgetId } = await context.params;
    const input = schema.parse(await request.json());
    const transition = transitions[input.action];
    if (!hasAccess(identity, transition.role)) throw new Error("FORBIDDEN");

    const prisma = getPrismaClient();
    const budget = await prisma.cohortBudget.findFirst({
      where: { id: budgetId, deletedAt: null },
      include: { versions: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!budget) throw new Error("NOT_FOUND");
    if (budget.workflowStage !== transition.from) throw new Error("INVALID_STAGE");

    const currentVersion = budget.versions[0];
    const database = d1Database();
    const statements: D1PreparedStatement[] = [
      database.prepare(`
        UPDATE "CohortBudget"
        SET "workflowStage" = ?, "status" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
      `).bind(transition.to, transition.status, budgetId),
    ];

    if (currentVersion) {
      if (input.action === "FINAL_APPROVE") {
        statements.push(
          database.prepare(`
            UPDATE "BudgetVersion"
            SET "status" = 'REEMPLAZADO'
            WHERE "budgetId" = ? AND "status" = 'APROBADO' AND "id" <> ?
          `).bind(budgetId, currentVersion.id),
        );
      }
      statements.push(
        database.prepare(`UPDATE "BudgetVersion" SET "status" = ? WHERE "id" = ?`)
          .bind(transition.status, currentVersion.id),
      );
    }

    statements.push(
      database.prepare(`
        INSERT INTO "BudgetWorkflowEvent" (
          "id", "budgetId", "userId", "role", "action", "fromStage", "toStage", "comment", "createdAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("workflow"),
        budgetId,
        identity.userId,
        transition.role,
        input.action,
        transition.from,
        transition.to,
        input.comment ?? null,
      ),
    );

    if (input.action !== "SUBMIT_VB") {
      statements.push(
        database.prepare(`
          INSERT INTO "Approval" (
            "id", "budgetId", "versionId", "userId", "decision", "level", "comment", "decidedAt", "createdAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          d1Id("approval"),
          budgetId,
          currentVersion?.id ?? null,
          identity.userId,
          input.action.endsWith("APPROVE") ? ApprovalDecision.APROBADO : ApprovalDecision.OBSERVADO,
          transition.role === "VISTO_BUENO" ? ApprovalLevel.VISTO_BUENO : ApprovalLevel.APROBACION,
          input.comment ?? null,
        ),
      );
    }

    statements.push(
      database.prepare(`
        INSERT INTO "AuditLog" (
          "id", "userId", "budgetId", "versionId", "entity", "entityId", "action",
          "previousValue", "newValue", "createdAt"
        ) VALUES (?, ?, ?, ?, 'CohortBudget', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        d1Id("audit"),
        identity.userId,
        budgetId,
        currentVersion?.id ?? null,
        budgetId,
        input.action,
        d1Json({ status: budget.status, workflowStage: budget.workflowStage }),
        d1Json({ status: transition.status, workflowStage: transition.to }),
      ),
    );

    await runD1Batch(statements);
    const record = await prisma.cohortBudget.findUnique({ where: { id: budgetId } });
    if (!record) throw new Error("NOT_FOUND");

    return Response.json(json({
      ...record,
      version: currentVersion ? { ...currentVersion, status: transition.status } : null,
    }));
  } catch (error) {
    return apiError(error);
  }
}
