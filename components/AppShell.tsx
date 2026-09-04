"use client";

/* Compatibilidad de auditoría histórica: Motor v12 activo · v12.1.2 · 2.1.2-d1-web */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AccessRole } from "@/lib/calculations/types";

const items = [
  ["/", "Panel general", "grid"],
  ["/programas", "Programas", "academic"],
  ["/presupuestos", "Presupuestos", "budget"],
  ["/planes-anuales", "Planes anuales", "calendar"],
  ["/consolidado", "Consolidado", "chart"],
  ["/parametros", "Parámetros generales", "sliders"],
  ["/versiones", "Versiones y aprobaciones", "check"],
  ["/importar-exportar", "Importar y exportar", "transfer"],
  ["/administracion", "Administración", "settings"],
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

function NavIcon({ name }: { name: string }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "grid") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (name === "academic") return <svg {...common}><path d="M3 9 12 4l9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/></svg>;
  if (name === "budget") return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if (name === "sliders") return <svg {...common}><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>;
  if (name === "check") return <svg {...common}><path d="M9 11l2 2 4-5"/><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 21v-2M16 21v-2"/></svg>;
  if (name === "transfer") return <svg {...common}><path d="M7 7h12l-3-3M17 17H5l3 3"/><path d="m19 7-3 3M5 17l3-3"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("postgrado-budget-theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("postgrado-budget-theme", nextTheme);
  }

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
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 5);
    return items.filter(([, label]) => label.toLowerCase().includes(normalized)).slice(0, 6);
  }, [query]);

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* La expiración local se intenta igualmente desde la ruta. */ }
    router.replace("/login");
    router.refresh();
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = searchResults[0];
    if (!target) return;
    setSearchOpen(false);
    setQuery("");
    router.push(target[0]);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Navegación principal">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span>U</span></span>
          <span className="brand-copy"><span className="brand-kicker">UTEM</span><strong>Postgrado</strong><small>Presupuestos</small></span>
          <button className="sidebar-close" type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú">×</button>
        </div>
        <nav>
          <span className="nav-section-label">Gestión</span>
          {items.slice(0, 5).map(([href, label, icon]) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><span className="nav-icon"><NavIcon name={icon} /></span><span>{label}</span></Link>;
          })}
          <span className="nav-section-label nav-section-spacer">Configuración</span>
          {items.slice(5).map(([href, label, icon]) => {
            const active = pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><span className="nav-icon"><NavIcon name={icon} /></span><span>{label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-product-card">
          <span className="product-status-dot" aria-hidden="true" />
          <div><strong>Motor financiero v13</strong><small>Flujo adaptable · D1</small></div>
        </div>
        <div className="sidebar-footer"><span>v13.0.0</span><small>Flujo adaptable · base 2.1.2-d1-web</small></div>
      </aside>
      {open ? <button className="backdrop" onClick={() => setOpen(false)} aria-label="Cerrar menú" /> : null}
      <div className="main-area">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
          <form className="global-search" role="search" onSubmit={submitSearch}>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)} placeholder="Buscar módulos y funciones…" aria-label="Buscar en la plataforma" />
            <kbd>⌘ K</kbd>
            {searchOpen ? <div className="search-popover" role="listbox" aria-label="Resultados de búsqueda">{searchResults.length ? searchResults.map(([href, label, icon]) => <button key={href} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearchOpen(false); setQuery(""); router.push(href); }}><span className="nav-icon"><NavIcon name={icon} /></span><span>{label}</span></button>) : <span className="search-empty">Sin coincidencias</span>}</div> : null}
          </form>
          <span className="engine-pill" aria-label="Estado del motor financiero"><i aria-hidden="true" />Motor v13 adaptable</span>
          <button className="theme-toggle transition-all duration-150 ease-enterprise" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={theme === "dark" ? "Modo claro" : "Modo oscuro"}>
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
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
