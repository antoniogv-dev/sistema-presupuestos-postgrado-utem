# Actualización v10 desde GitHub web + Cloudflare D1

Esta guía es para un repositorio que ya tiene la versión anterior funcionando o en proceso de despliegue.

## Importante

Use el ZIP incremental `actualizacion-v10-github-web.zip`.

Ese paquete **no contiene `wrangler.jsonc`**, por lo tanto no reemplaza:
- su Database ID real de D1;
- su nombre de base;
- su AUD de Cloudflare Access;
- su dominio de Zero Trust.

No necesita recrear D1.

## 1. Subir la actualización a GitHub web

1. Descomprima `actualizacion-v10-github-web.zip`.
2. Abra su repositorio en GitHub.
3. Pulse **Add file → Upload files**.
4. Arrastre todo el contenido descomprimido.
5. Confirme que GitHub preserve rutas como:
   - `app/programas/page.tsx`;
   - `app/api/programs/route.ts`;
   - `migrations/0003_functional_improvements.sql`;
   - `features/budgets/components/BudgetWorkspace.tsx`;
   - `lib/auth/api-access.ts`.
6. No debe aparecer una carpeta adicional llamada `actualizacion-v10-github-web` dentro del repositorio.
7. Use como mensaje:

```text
feat: incorpora mejoras funcionales v10 para Cloudflare D1
```

## 2. Confirmar la migración

En GitHub debe existir:

```text
migrations/0003_functional_improvements.sql
```

No ejecute manualmente 0001 ni 0002 otra vez.

El deploy command del proyecto ejecuta:

```bash
wrangler d1 migrations apply DB --remote
```

Wrangler aplicará sólo las migraciones pendientes.

## 3. Configurar a Antonio Gutiérrez como Administrador

En Cloudflare:

```text
Workers & Pages
→ su Worker
→ Settings
→ Variables and Secrets
```

Configure una variable de texto:

```text
BOOTSTRAP_ADMIN_EMAIL = CORREO_REAL_DE_ANTONIO
```

Opcionalmente, para habilitar acceso por correo/contraseña además de Cloudflare Access, agregue como **Secret**:

```text
BOOTSTRAP_ADMIN_PASSWORD = CONTRASEÑA_INICIAL_SEGURA
```

No agregue la contraseña al repositorio.

Al ingresar con el correo configurado, el sistema reconcilia el registro con:

```text
Nombre: Antonio Gutiérrez
Roles: ADMIN + GESTOR + VISTO_BUENO + APROBADOR
```

Desde `Administración` puede crear los demás usuarios y asignar cualquiera de los seis roles.

## 4. Configuración del build

Mantenga en Cloudflare Build variables:

```text
NODE_VERSION = 22
SKIP_DEPENDENCY_INSTALL = 1
```

Build command:

```bash
npm install --include=dev --no-audit --no-fund && npm run build:cloudflare
```

Deploy command:

```bash
npm run deploy:cloudflare
```

## 5. Qué debe aparecer en el log

Antes de OpenNext debe observar:

```text
npm run db:generate
npm run quality:cloudflare
npm run preflight
npm run source:audit
npm run typecheck
npm run lint
npm run test:engine
npm run test
npm run test:standalone
OpenNext — Cloudflare build
```

Si una validación falla, el proceso se detendrá antes de publicar una versión inconsistente.

## 6. Verificar D1 después del despliegue

Desde Cloudflare:

```text
D1 SQL Database
→ postgrado-presupuestos-prod
→ Console
```

Ejecute `database/d1/VERIFICAR_D1.sql`.

Resultados esperados de la instalación de referencia:

```text
25 tablas funcionales
6 roles
3 plantillas
5 ítems de plantilla
17 parámetros institucionales
190 valores de parámetros
1 tabla UserSession
4 columnas de credenciales en User
1 columna templateType en ProgramAnnualTuition
```

La cantidad de usuarios, programas y presupuestos dependerá de sus datos reales.

## 7. Pruebas de aceptación recomendadas

1. Programas → Agregar programa → guardar.
2. Programas → Modificar programa.
3. Aplicar filtro por tipo y estado.
4. Cambiar fuente de arancel entre las tres plantillas.
5. Parámetros → cambiar un valor → Guardar parámetros → recargar.
6. Presupuestos → confirmar separación de estudiantes, horas directas, horas de reemplazo y becas.
7. Versiones → elegir dos versiones y comparar.
8. Administración → crear Lector y Creador de prueba.
9. Exportar XLSX y PDF de un presupuesto.
10. Consolidado → Exportar consolidado.

## 8. Si “Usuarios habilitados” muestra un error

La causa más probable en una base anterior es que 0003 aún no se haya aplicado. Revise el log del deploy y luego:

```bash
wrangler d1 migrations list DB --remote
```

Si `0003_functional_improvements.sql` aparece pendiente, vuelva a ejecutar el despliegue. No copie el SQL manualmente si Wrangler todavía puede gestionarlo.
