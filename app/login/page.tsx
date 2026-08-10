"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface LoginErrorBody {
  error?: unknown;
  code?: unknown;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorCode("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body: LoginErrorBody = await response.json().catch(() => ({}));
      const apiMessage = typeof body.error === "string" ? body.error.trim() : "";
      const apiCode = typeof body.code === "string" ? body.code.trim() : "";
      if (!response.ok) {
        setErrorCode(apiCode);
        throw new Error(apiMessage || "No fue posible iniciar sesión.");
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <span className="brand-kicker">UTEM · Escuela de Postgrado</span>
      <h1>Sistema de Presupuestos</h1>
      <p>Ingrese con su cuenta interna. Si la aplicación está protegida con Cloudflare Access, la sesión institucional también sigue siendo válida.</p>
      {message ? <div className="notice warning" role="alert">
        <div>{message}</div>
        {errorCode ? <small>Código de diagnóstico: <strong>{errorCode}</strong></small> : null}
      </div> : null}
      <form onSubmit={submit} className="login-form">
        <label>Correo institucional<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="button primary" type="submit" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </section>
  </main>;
}
