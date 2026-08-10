"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface LoginResponseBody {
  error?: unknown;
  code?: unknown;
}

function isLoginResponseBody(value: unknown): value is LoginResponseBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readLoginResponse(response: Response): Promise<LoginResponseBody> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed: unknown = await response.json().catch(() => ({}));
    return isLoginResponseBody(parsed) ? parsed : {};
  }

  const text = await response.text().catch(() => "");
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return {
    code: `AUTH_HTTP_${response.status}`,
    error: preview
      ? `La API de inicio de sesión respondió HTTP ${response.status} con contenido no JSON. ${preview}`
      : `La API de inicio de sesión respondió HTTP ${response.status} sin una respuesta JSON válida.`,
  };
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
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const body = await readLoginResponse(response);
      const apiMessage = typeof body.error === "string" ? body.error.trim() : "";
      const apiCode = typeof body.code === "string" ? body.code.trim() : "";

      if (!response.ok) {
        setErrorCode(apiCode || `AUTH_HTTP_${response.status}`);
        throw new Error(apiMessage || `No fue posible iniciar sesión (HTTP ${response.status}).`);
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      if (error instanceof TypeError) {
        setErrorCode("AUTH_NETWORK_ERROR");
        setMessage("No fue posible conectar con la API de autenticación. Revise el despliegue del Worker y Cloudflare Access.");
      } else {
        setMessage(error instanceof Error ? error.message : "No fue posible iniciar sesión.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="brand-kicker">UTEM · Escuela de Postgrado</span>
        <h1>Sistema de Presupuestos</h1>
        <p>Ingrese con su cuenta interna. Si la aplicación está protegida con Cloudflare Access, la sesión institucional también sigue siendo válida.</p>
        {message ? (
          <div className="notice warning" role="alert">
            <div>{message}</div>
            {errorCode ? <small>Código de diagnóstico: <strong>{errorCode}</strong></small> : null}
          </div>
        ) : null}
        <form onSubmit={submit} className="login-form">
          <label>Correo institucional<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="button primary" type="submit" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
        </form>
      </section>
    </main>
  );
}
