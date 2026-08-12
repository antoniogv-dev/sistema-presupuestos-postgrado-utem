# Verificación v10.8

Versión: `1.0.18-d1-web` / release `v10.8`.

## Verificaciones ejecutadas en el paquete

- Compilación aislada del motor financiero TypeScript: correcta.
- Pruebas autónomas existentes del motor: **12/12 correctas**.
- Aserciones específicas v10.8 ejecutadas sobre el motor compilado:
  - dos cobros de matrícula para cuatro semestres, incluso si abarcan tres años calendario;
  - descuentos aplicados a matrícula;
  - matrícula excluida de `INGRESOS TOTAL`;
  - costo manual anual repetido en años activos;
  - base de overhead = arancel bruto − descuentos − incobrables;
  - Dirección 2027 `$4.152.675` al 50 % = `$2.076.337,50`;
  - becas profesionales ignoradas mientras estén deshabilitadas.
- Aplicación secuencial en SQLite limpio de migraciones `0001`, `0002`, `0003` y `0004`: correcta.
- `preflight`: correcto con advertencias esperadas por marcadores de configuración del paquete de referencia.
- `source:audit`: correcto; incluye protecciones para:
  - PBKDF2 `100_000`;
  - prohibición de `--no-engine` en `db:generate`;
  - migración v10.8;
  - reglas financieras y controles principales de v10.8.
- Revisión sintáctica TypeScript/TSX de los archivos modificados: sin errores sintácticos distintos de imports no resolubles en el entorno aislado.

## Verificación que debe realizar Cloudflare

El entorno de generación de este paquete no tuvo acceso operativo al registro npm para reinstalar las dependencias, por lo que no se pudo ejecutar localmente el build completo Next.js + Prisma + OpenNext + Vitest.

Esto no corresponde a un error detectado del proyecto. El build productivo de Cloudflare, que ya instala las dependencias con el comando configurado, es la verificación integral final.

Después del deploy se recomienda comprobar:

1. `/api/version` → `1.0.18-d1-web`, `v10.8`.
2. `/api/me` → identidad y roles.
3. `/api/programs?includeInactive=1` → respuesta JSON sin error 500.
4. `/api/parameters` → respuesta JSON sin error 500.
5. `/api/budgets` → respuesta JSON sin error 500.
6. Formulación de un presupuesto profesional con las 11 mejoras indicadas en `ACTUALIZACION_GITHUB_WEB_V10_8.md`.
