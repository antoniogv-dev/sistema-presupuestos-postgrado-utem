"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

type AccessLevel = "GESTOR" | "VISTO_BUENO" | "APROBADOR";
type Identity = { userId: string; email: string; name: string; roles: AccessLevel[]; source: string };
type ManagedUser = { id: string; email: string; name: string; active: boolean; roles: AccessLevel[] };

const roleLabels: Record<AccessLevel, string> = {
  GESTOR: "Gestor",
  VISTO_BUENO: "V°B°",
  APROBADOR: "Aprobación",
};

function responseErrorMessage(body: unknown): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !("error" in body)
  ) {
    return "No fue posible completar la operación.";
  }

  const error = (body as { error?: unknown }).error;

  return typeof error === "string" && error.trim().length > 0
    ? error
    : "No fue posible completar la operación.";
}

async function responseBody<T = unknown>(
  response: Response,
): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(responseErrorMessage(body));
  }

  return body as T;
}

export default function AdministrationPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [message, setMessage] = useState("Cargando identidad institucional…");
  const [form, setForm] = useState({ email: "", name: "", accessLevel: "GESTOR" as AccessLevel });

  async function loadUsers() {
    const me = await responseBody<Identity>(
  await fetch("/api/me", { cache: "no-store" }),
);
    setIdentity(me);
    if (!me.roles.includes("APROBADOR")) {
      setMessage("Su identidad fue validada. Sólo el nivel Aprobación puede administrar usuarios.");
      return;
    }
    const records = await responseBody<ManagedUser[]>(
  await fetch("/api/admin/users", { cache: "no-store" }),
);
    setUsers(records);
    setMessage("Usuarios y niveles cargados desde Cloudflare D1.");
  }

  useEffect(() => {
    loadUsers().catch((error) => setMessage(error instanceof Error ? error.message : "No fue posible resolver la identidad."));
  }, []);

  async function assignUser(event: FormEvent) {
    event.preventDefault();
    try {
      await responseBody(await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, active: true }),
      }));
      setForm({ email: "", name: "", accessLevel: "GESTOR" });
      setMessage("Nivel de acceso asignado y auditado.");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible asignar el nivel.");
    }
  }

  async function setActive(user: ManagedUser, active: boolean) {
    try {
      await responseBody(await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, name: user.name, accessLevel: user.roles[0] ?? "GESTOR", active }),
      }));
      setMessage(active ? "Usuario habilitado." : "Usuario deshabilitado.");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar el usuario.");
    }
  }

  const canManage = identity?.roles.includes("APROBADOR") ?? false;

  return <AppShell>
    <PageHeader eyebrow="Administración" title="Usuarios y niveles de acceso" description="Circuito segregado de gestión, visto bueno y aprobación final, persistido en Cloudflare D1." />
    <section className="panel"><div className="panel-title"><div><h2>Niveles funcionales</h2><p>Cada nivel dispone únicamente de las acciones correspondientes a su etapa.</p></div></div><div className="access-level-grid"><article className="access-level-card"><h3>1. Gestor</h3><p>Crea, modifica y elimina borradores u observados. Configura aranceles y envía a visto bueno.</p></article><article className="access-level-card"><h3>2. V°B°</h3><p>Revisa antecedentes técnicos, observa o deriva la versión a la etapa de aprobación.</p></article><article className="access-level-card"><h3>3. Aprobación</h3><p>Aprueba u observa la versión final y administra los niveles de acceso.</p></article></div></section>

    <div className="notice" role="status" aria-live="polite"><strong>Sesión</strong><span>{identity ? `${identity.name} · ${identity.roles.map((role) => roleLabels[role]).join(", ")}` : message}</span>{identity ? <small>{identity.email} · {identity.source === "CLOUDFLARE_ACCESS" ? "Cloudflare Access" : "Servicio interno"}</small> : null}</div>

    {canManage ? <section className="panel"><div className="panel-title"><div><h2>Asignar o cambiar un nivel</h2><p>La operación reemplaza la asignación vigente y genera un registro de auditoría.</p></div></div><form className="form-grid cols-4" onSubmit={assignUser}><label>Correo institucional<input type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Nombre<input required minLength={3} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Nivel<select value={form.accessLevel} onChange={(event) => setForm((current) => ({ ...current, accessLevel: event.target.value as AccessLevel }))}><option value="GESTOR">Gestor</option><option value="VISTO_BUENO">V°B°</option><option value="APROBADOR">Aprobación</option></select></label><div className="form-action"><button className="button primary" type="submit">Guardar acceso</button></div></form></section> : null}

    <section className="panel"><div className="panel-title"><div><h2>Usuarios habilitados</h2><p>{canManage ? "Información obtenida desde la base de datos." : "La nómina completa requiere nivel Aprobación."}</p></div></div>{canManage ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Usuario</th><th>Nivel</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.roles.map((role) => roleLabels[role]).join(", ") || "Sin nivel"}</td><td><StatusBadge status={user.active ? "Activo" : "Inactivo"} /></td><td><button className="text-button" type="button" onClick={() => setActive(user, !user.active)}>{user.active ? "Deshabilitar" : "Habilitar"}</button></td></tr>)}</tbody></table></div> : <p>{message}</p>}</section>
  </AppShell>;
}
