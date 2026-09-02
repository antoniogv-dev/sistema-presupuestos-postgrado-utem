import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Presupuestos de Postgrado UTEM",
  description: "Formulación, evaluación y consolidación presupuestaria de programas de postgrado.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
