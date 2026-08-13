"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AccessRole } from "@/lib/calculations/types";

const items = [
  ["/", "Panel general"],
  ["/programas", "Programas"],
  ["/presupuestos", "Presupuestos"],
  ["/consolidado", "Consolidado"],
  ["/parametros", "Parámetros generales"],
  ["/versiones", "Versiones y aprobaciones"],
  ["/importar-exportar", "Importar y exportar"],
  ["/administracion", "Administración"],
] as const;

type Identity = { userId: string; email: string; name: string; roles: AccessRole[]; source: string };
const roleLabels: Record<AccessRole, string> = {
  ADMIN: "Administrador",
  CREADOR: "Creador",
  LECTOR: "Lector",
  GESTOR: "Gestor",
  VISTO_BUENO: "V°B°",
  APROBADOR: "Aprobación",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "UT";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        return response.ok ? response.json() as Promise<Identity> : null;
      })
      .then((value) => value && setIdentity(value))
      .catch(() => undefined);
  }, [router]);

  const roleText = useMemo(() => identity?.roles.map((role) => roleLabels[role] ?? role).join(" · ") ?? "Sesión institucional", [identity]);

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* La expiración local se intenta igualmente desde la ruta. */ }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Navegación principal">
        <div className="brand">
          <span className="brand-kicker">UTEM · Escuela de Postgrado</span>
          <strong>Presupuestos</strong>
          <button className="sidebar-close" type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú">×</button>
        </div>
        <nav>
          {items.map(([href, label]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><span aria-hidden="true" className="nav-dot" />{label}</Link>;
          })}
        </nav>
        <div className="sidebar-footer"><span>Versión Cloudflare D1 · v10.12</span><small>Motor financiero trazable · 1.0.22-d1-web</small></div>
      </aside>
      {open ? <button className="backdrop" onClick={() => setOpen(false)} aria-label="Cerrar menú" /> : null}
      <div className="main-area">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
          <div><strong>Sistema de Presupuestos de Postgrado UTEM</strong><span>Formulación · Evaluación · Consolidación · Seguimiento</span></div>
          <div className="user-chip" aria-label="Usuario actual">
            <span className="avatar" aria-hidden="true">{initials(identity?.name ?? "Usuario UTEM")}</span>
            <span><strong>{identity?.name ?? "Usuario UTEM"}</strong><small>{roleText}</small></span>
            {identity?.source === "INTERNAL_SESSION" ? <button className="text-button user-logout" type="button" onClick={() => void logout()}>Salir</button> : null}
          </div>
        </header>
        <main id="contenido-principal" className="content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
