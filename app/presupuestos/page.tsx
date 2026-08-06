import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { BudgetWorkspace } from "@/features/budgets/components/BudgetWorkspace";

export default function BudgetsPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Presupuestos" title="Formulación de cohorte" description="Edite parámetros, revise validaciones y analice el flujo financiero completo." />
      <BudgetWorkspace />
    </AppShell>
  );
}
