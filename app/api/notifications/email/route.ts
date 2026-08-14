import { z } from "zod";
import { apiError, requireApiIdentity } from "@/lib/auth/api-access";
import { d1Database, runtimeValue } from "@/lib/runtime-env";
import { d1Id } from "@/lib/database/d1-atomic";
import { getPrismaClient } from "@/lib/database/prisma";

const schema = z.object({
  budgetId: z.string().min(1),
  recipientEmail: z.string().email(),
  recipientName: z.string().trim().optional(),
  action: z.string().trim().default("SHARE"),
  comment: z.string().trim().max(1000).optional(),
});

function statusLabel(status: string) {
  return ({ BORRADOR: "Borrador", EN_REVISION: "En revisión", OBSERVADO: "Observado", APROBADO: "Aprobado", REEMPLAZADO: "Reemplazado" } as Record<string,string>)[status] ?? status;
}

function actionNotice(action: string): string {
  const messages: Record<string, string> = {
    SUBMIT_VB: "Se informa que se encuentra disponible un presupuesto de Postgrado para su V°B°.",
    VB_APPROVE: "Se informa que se encuentra disponible un presupuesto de Postgrado para su aprobación.",
    VB_OBSERVE: "Se informa que un presupuesto de Postgrado fue observado en la etapa de V°B° y se encuentra disponible para su revisión y ajuste.",
    FINAL_APPROVE: "Se informa que un presupuesto de Postgrado fue aprobado y se encuentra disponible para su consulta.",
    FINAL_OBSERVE: "Se informa que un presupuesto de Postgrado fue observado en la etapa de aprobación y se encuentra disponible para su revisión y ajuste.",
    SHARE: "Se comparte un presupuesto de Postgrado disponible para su consulta.",
  };
  return messages[action] ?? messages.SHARE;
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const input = schema.parse(await request.json());
    const budget = await getPrismaClient().cohortBudget.findFirst({
      where: { id: input.budgetId, deletedAt: null },
      include: { program: true, versions: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!budget) throw new Error("NOT_FOUND");
    const status = statusLabel(budget.status);
    const origin = runtimeValue("PUBLIC_APP_URL") ?? new URL(request.url).origin;
    const url = `${origin}/presupuestos?budget=${encodeURIComponent(budget.id)}`;
    const subject = `[${status}] Presupuesto ${budget.program.code} · ${budget.cohortName}`;
    const salutation = input.recipientName?.trim() ? `Estimada/o ${input.recipientName.trim()},` : "Estimada/o,";
    const body = `${salutation}\n\n${actionNotice(input.action)}\n\nPrograma: ${budget.program.name}\nVersión del programa: ${budget.programVersionLabel}\nCohorte: ${budget.cohortName}\nEstado: ${status}\nRevisión interna: R${budget.versions[0]?.number ?? 1}\n${input.comment ? `Comentario: ${input.comment}\n` : ""}\nAcceso al presupuesto: ${url}\n\nEste aviso fue generado desde el Sistema de Presupuestos de Postgrado UTEM.`;

    let deliveryStatus = "PREPARADO";
    let providerWarning: string | null = null;
    const apiKey = runtimeValue("RESEND_API_KEY");
    const from = runtimeValue("NOTIFICATION_FROM_EMAIL");
    if (apiKey && from) {
      try {
        const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [input.recipientEmail], subject, text: body }) });
        if (response.ok) deliveryStatus = "ENVIADO";
        else providerWarning = `El proveedor de correo respondió ${response.status}; se preparó el correo para envío manual.`;
      } catch {
        providerWarning = "No fue posible contactar al proveedor de correo; se preparó el correo para envío manual.";
      }
    }

    const database = d1Database();
    await database.prepare(`INSERT INTO "BudgetNotification" ("id","budgetId","userId","action","recipientEmail","recipientName","channel","status","subject","createdAt") VALUES (?,?,?,?,?,?,'EMAIL',?,?,CURRENT_TIMESTAMP)`).bind(d1Id("notification"), budget.id, identity.userId, input.action, input.recipientEmail, input.recipientName ?? null, deliveryStatus, subject).run();
    const mailtoUrl = `mailto:${encodeURIComponent(input.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return Response.json({ ok: true, sent: deliveryStatus === "ENVIADO", subject, body, mailtoUrl, budgetUrl: url, warning: providerWarning });
  } catch (error) { return apiError(error); }
}
