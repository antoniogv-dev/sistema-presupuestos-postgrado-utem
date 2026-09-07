"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { AccessRole } from "@/lib/calculations/types";
import type { ApiBudgetRecord } from "@/lib/mappers/budget-api";

type Identity = { userId: string; email: string; name: string; roles: AccessRole[]; source: string };
type ManagedUser = { id: string; email: string; name: string; active: boolean; hasPassword: boolean; roles: AccessRole[] };
type WorkflowDirection = "UP" | "DOWN";
type WorkflowStage = ApiBudgetRecord["workflowStage"];

type UserForm = {
  id?: string;
  email: string;
  name: string;
  password: string;
  roles: AccessRole[];
  active: boolean;
};

const availableRoles: Array<{ code: AccessRole; label: string; description: string }> = [
  { code: "ADMIN", label: "Administrador", description: "Administra usuarios, programas, parámetros y puede actuar en cualquier módulo." },
  { code: "CREADOR", label: "Creador", description: "Crea nuevos programas y presupuestos, sin facultades de aprobación." },
  { code: "LECTOR", label: "Lector", description: "Consulta información sin modificar registros." },
  { code: "GESTOR", label: "Gestor", description: "Modifica presupuestos en gestión y administra su formulación." },
  { code: "VISTO_BUENO", label: "V°B°", description: "Revisa técnicamente y deriva u observa presupuestos." },
  { code: "APROBADOR", label: "Aprobación", description: "Aprueba u observa la versión final." },
];

const roleLabels = Object.fromEntries(availableRoles.map((role) => [role.code, role.label])) as Record<AccessRole, string>;
const emptyForm: UserForm = { email: "", name: "", password: "", roles: ["LECTOR"], active: true };
const workflowOrder: WorkflowStage[] = ["GESTION", "VISTO_BUENO", "APROBACION", "FINALIZADO"];
const workflowLabels: Record<WorkflowStage, string> = {
  GESTION: "Gestión",
  VISTO_BUENO: "V°B°",
  APROBACION: "Aprobación",
  FINALIZADO: "Finalizado",
};
const budgetStatusLabels: Record<string, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  OBSERVADO: "Observado",
  APROBADO: "Aprobado",
  REEMPLAZADO: "Reemplazado",
};

function responseErrorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) return "No fue posible completar la operación.";
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : "No fue posible completar la operación.";
}

async function responseBody<T = unknown>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseErrorMessage(body));
  return body as T;
}

function adjacentStage(stage: WorkflowStage, direction: WorkflowDirection): WorkflowStage | null {
  const index = workflowOrder.indexOf(stage);
  if (index < 0) return null;
  return workflowOrder[direction === "UP" ? index + 1 : index - 1] ?? null;
}

export default function AdministrationPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [budgets, setBudgets] = useState<ApiBudgetRecord[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [levelComment, setLevelComment] = useState("");
  const [message, setMessage] = useState("Cargando identidad institucional…");
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingLevel, setMovingLevel] = useState(false);

  const canManage = identity?.roles.includes("ADMIN") ?? false;
  const editing = Boolean(form.id);
  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId],
  );
  const lowerStage = selectedBudget ? adjacentStage(selectedBudget.workflowStage, "DOWN") : null;
  const upperStage = selectedBudget ? adjacentStage(selectedBudget.workflowStage, "UP") : null;

  async function loadUsers() {
    const me = await responseBody<Identity>(await fetch("/api/me", { cache: "no-store" }));
    setIdentity(me);
    if (!me.roles.includes("ADMIN")) {
      setMessage("Su identidad fue validada. Sólo el rol Administrador puede gestionar usuarios y estados presupuestarios.");
      return;
    }
    const [records, budgetRecords] = await Promise.all([
      responseBody<ManagedUser[]>(await fetch("/api/admin/users", { cache: "no-store" })),
      responseBody<ApiBudgetRecord[]>(await fetch("/api/budgets", { cache: "no-store" })),
    ]);
    setUsers(records);
    setBudgets(budgetRecords);
    setSelectedBudgetId((current) => budgetRecords.some((budget) => budget.id === current) ? current : budgetRecords[0]?.id ?? "");
    setMessage("Administración cargada correctamente desde Cloudflare D1.");
  }

  useEffect(() => {
    loadUsers().catch((error) => setMessage(error instanceof Error ? error.message : "No fue posible resolver la identidad."));
  }, []);

  function toggleRole(role: AccessRole) {
    setForm((current) => {
      const exists = current.roles.includes(role);
      const roles = exists ? current.roles.filter((candidate) => candidate !== role) : [...current.roles, role];
      return { ...current, roles: roles.length ? roles : ["LECTOR"] };
    });
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await responseBody(await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: form.id, email: form.email, name: form.name, password: form.password, roles: form.roles, active: form.active }),
      }));
      setForm(emptyForm);
      setMessage(editing ? "Usuario actualizado y auditado." : "Usuario creado y auditado.");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(user: ManagedUser, active: boolean) {
    try {
      await responseBody(await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, active }),
      }));
      setMessage(active ? "Usuario habilitado." : "Usuario deshabilitado.");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar el usuario.");
    }
  }

  async function changeBudgetLevel(direction: WorkflowDirection) {
    if (!selectedBudget || movingLevel) return;
    const targetStage = adjacentStage(selectedBudget.workflowStage, direction);
    if (!targetStage) return;
    const verb = direction === "UP" ? "subir" : "bajar";
    const confirmed = window.confirm(
      `¿Confirma ${verb} el presupuesto ${selectedBudget.program.code} · ${selectedBudget.cohortName} desde ${workflowLabels[selectedBudget.workflowStage]} a ${workflowLabels[targetStage]}?`,
    );
    if (!confirmed) return;

    setMovingLevel(true);
    try {
      await responseBody(await fetch("/api/admin/budgets/workflow-level", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetId: selectedBudget.id, direction, comment: levelComment.trim() || undefined }),
      }));
      setLevelComment("");
      await loadUsers();
      setMessage(`Cambio administrativo registrado: ${selectedBudget.program.code} · ${selectedBudget.cohortName} quedó en ${workflowLabels[targetStage]}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cambiar el nivel del presupuesto.");
    } finally {
      setMovingLevel(false);
    }
  }

  function editUser(user: ManagedUser) {
    setForm({ id: user.id, email: user.email, name: user.name, password: "", roles: user.roles.length ? user.roles : ["LECTOR"], active: user.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sessionDescription = useMemo(() => {
    if (!identity) return message;
    const source = identity.source === "CLOUDFLARE_ACCESS" ? "Cloudflare Access" : identity.source === "INTERNAL_SESSION" ? "Sesión interna" : "Servicio interno";
    return `${identity.name} · ${identity.roles.map((role) => roleLabels[role] ?? role).join(", ")} · ${source}`;
  }, [identity, message]);

  return <AppShell>
    <PageHeader eyebrow="Administración" title="Usuarios, roles y estados presupuestarios" description="Administración segregada de accesos y control excepcional del nivel de los presupuestos, con trazabilidad en Cloudflare D1." actions={<Link className="button secondary" href="/login">Ir al inicio de sesión</Link>} />

    <div className="notice" role="status" aria-live="polite"><strong>Sesión</strong><span>{sessionDescription}</span>{identity ? <small>{identity.email}</small> : null}</div>

    <section className="panel">
      <div className="panel-title"><div><h2>Roles funcionales</h2><p>Los roles se pueden combinar. Administrador incorpora acceso total; Lector nunca habilita escritura por sí solo.</p></div></div>
      <div className="access-level-grid roles-six">{availableRoles.map((role) => <article className="access-level-card" key={role.code}><h3>{role.label}</h3><p>{role.description}</p></article>)}</div>
    </section>

    {canManage ? <section className="panel">
      <div className="panel-title"><div><h2>Control administrativo de estados</h2><p>Permite al Administrador subir o bajar un presupuesto exactamente un nivel. El movimiento es excepcional, queda auditado y no elimina el historial previo de revisiones o aprobaciones.</p></div></div>
      <div className="form-grid cols-3">
        <label>Presupuesto
          <select value={selectedBudgetId} onChange={(event) => { setSelectedBudgetId(event.target.value); setLevelComment(""); }}>
            <option value="">Seleccione</option>
            {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.program.code} · {budget.cohortName} · {workflowLabels[budget.workflowStage]}</option>)}
          </select>
        </label>
        <label>Nivel actual<input readOnly value={selectedBudget ? workflowLabels[selectedBudget.workflowStage] : "—"} /></label>
        <label>Estado actual<input readOnly value={selectedBudget ? budgetStatusLabels[selectedBudget.status] ?? selectedBudget.status : "—"} /></label>
      </div>
      {selectedBudget ? <div className="notice info"><strong>{selectedBudget.program.name}</strong><span>Flujo actual: {workflowLabels[selectedBudget.workflowStage]} · Estado: {budgetStatusLabels[selectedBudget.status] ?? selectedBudget.status}</span><small>Al volver a Gestión el presupuesto queda editable; al llegar a Finalizado queda Aprobado. Las versiones y eventos anteriores se conservan para auditoría.</small></div> : null}
      <label>Motivo u observación del cambio administrativo
        <textarea rows={3} maxLength={1000} placeholder="Opcional, pero recomendable para dejar trazabilidad del motivo." value={levelComment} onChange={(event) => setLevelComment(event.target.value)} />
      </label>
      <div className="form-actions-row">
        <button className="button secondary" type="button" disabled={!selectedBudget || !lowerStage || movingLevel} onClick={() => void changeBudgetLevel("DOWN")}>{movingLevel ? "Procesando…" : lowerStage ? `Bajar a ${workflowLabels[lowerStage]}` : "Nivel mínimo"}</button>
        <button className="button primary" type="button" disabled={!selectedBudget || !upperStage || movingLevel} onClick={() => void changeBudgetLevel("UP")}>{movingLevel ? "Procesando…" : upperStage ? `Subir a ${workflowLabels[upperStage]}` : "Nivel máximo"}</button>
      </div>
    </section> : null}

    {canManage ? <section className="panel">
      <div className="panel-title"><div><h2>{editing ? "Modificar usuario" : "Agregar usuario"}</h2><p>{editing ? "Deje la contraseña vacía para mantener la actual." : "Para un usuario nuevo la contraseña es obligatoria y se guarda únicamente como hash PBKDF2."}</p></div>{editing ? <button className="button secondary" type="button" onClick={() => setForm(emptyForm)}>Cancelar edición</button> : null}</div>
      <form onSubmit={saveUser} className="user-admin-form">
        <div className="form-grid cols-4">
          <label>Nombre<input required minLength={3} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Correo institucional<input type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Contraseña<input type="password" minLength={8} required={!editing} autoComplete="new-password" placeholder={editing ? "Mantener contraseña actual" : "Mínimo 8 caracteres"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></label>
          <label>Estado<select value={form.active ? "ACTIVO" : "INACTIVO"} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === "ACTIVO" }))}><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></select></label>
        </div>
        <fieldset className="role-checkboxes"><legend>Roles asignados</legend>{availableRoles.map((role) => <label key={role.code}><input type="checkbox" checked={form.roles.includes(role.code)} onChange={() => toggleRole(role.code)} /><span><strong>{role.label}</strong><small>{role.description}</small></span></label>)}</fieldset>
        <div className="form-actions-row"><button className="button primary" type="submit" disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}</button></div>
      </form>
    </section> : null}

    <section className="panel">
      <div className="panel-title"><div><h2>Usuarios habilitados</h2><p>{canManage ? "Nómina leída desde D1. Puede modificar roles, contraseña y estado." : "La nómina completa requiere el rol Administrador."}</p></div><button className="button secondary" type="button" disabled={!canManage} onClick={() => loadUsers().catch((error) => setMessage(error instanceof Error ? error.message : "No fue posible recargar."))}>Recargar</button></div>
      {canManage ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Usuario</th><th>Roles</th><th>Contraseña</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.roles.map((role) => roleLabels[role] ?? role).join(", ") || "Sin rol"}</td><td>{user.hasPassword ? "Configurada" : "Pendiente"}</td><td><StatusBadge status={user.active ? "Activo" : "Inactivo"} /></td><td><div className="row-actions"><button className="text-button" type="button" onClick={() => editUser(user)}>Modificar</button><button className="text-button" type="button" onClick={() => setActive(user, !user.active)}>{user.active ? "Deshabilitar" : "Habilitar"}</button></div></td></tr>) : <tr><td colSpan={5}>No hay usuarios registrados.</td></tr>}</tbody></table></div> : <p>{message}</p>}
    </section>
  </AppShell>;
}
