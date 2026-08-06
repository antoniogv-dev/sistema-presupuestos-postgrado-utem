"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
            return (
              <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}>
                <span aria-hidden="true" className="nav-dot" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span>Versión de demostración</span>
          <small>Motor financiero trazable</small>
        </div>
      </aside>
      {open ? <button className="backdrop" onClick={() => setOpen(false)} aria-label="Cerrar menú" /> : null}
      <div className="main-area">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
          <div>
            <strong>Sistema de Presupuestos de Postgrado UTEM</strong>
            <span>Formulación · Evaluación · Consolidación · Seguimiento</span>
          </div>
          <div className="user-chip" aria-label="Usuario actual">
            <span className="avatar" aria-hidden="true">AG</span>
            <span><strong>Antonio Gutiérrez</strong><small>Gestión de Recursos</small></span>
          </div>
        </header>
        <main id="contenido-principal" className="content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
