"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { AccessRole } from "@/lib/calculations/types";

type Identity = { userId: string; email: string; name: string; roles: AccessRole[]; source: string };
type ManagedUser = { id: string; email: string; name: string; active: boolean; hasPassword: boolean; roles: AccessRole[] };

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

export default function AdministrationPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [message, setMessage] = useState("Cargando identidad institucional…");
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const canManage = identity?.roles.includes("ADMIN") ?? false;
  const editing = Boolean(form.id);

  async function loadUsers() {
    const me = await responseBody<Identity>(await fetch("/api/me", { cache: "no-store" }));
    setIdentity(me);
    if (!me.roles.includes("ADMIN")) {
      setMessage("Su identidad fue validada. Sólo el rol Administrador puede gestionar usuarios.");
      return;
    }
    const records = await responseBody<ManagedUser[]>(await fetch("/api/admin/users", { cache: "no-store" }));
    setUsers(records);
    setMessage("Usuarios cargados correctamente desde Cloudflare D1.");
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
    <PageHeader eyebrow="Administración" title="Usuarios, contraseñas y roles" description="Administración segregada de accesos, con credenciales internas opcionales y auditoría en Cloudflare D1." actions={<Link className="button secondary" href="/login">Ir al inicio de sesión</Link>} />

    <div className="notice" role="status" aria-live="polite"><strong>Sesión</strong><span>{sessionDescription}</span>{identity ? <small>{identity.email}</small> : null}</div>

    <section className="panel">
      <div className="panel-title"><div><h2>Roles funcionales</h2><p>Los roles se pueden combinar. Administrador incorpora acceso total; Lector nunca habilita escritura por sí solo.</p></div></div>
      <div className="access-level-grid roles-six">{availableRoles.map((role) => <article className="access-level-card" key={role.code}><h3>{role.label}</h3><p>{role.description}</p></article>)}</div>
    </section>

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
