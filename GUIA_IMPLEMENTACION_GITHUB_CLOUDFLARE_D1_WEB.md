# Guía de implementación nueva y limpia
## GitHub web + Cloudflare web + D1 Database

Esta guía permite publicar el sistema sin utilizar Git local, Wrangler local, Docker, PostgreSQL ni Hyperdrive. Los comandos técnicos quedan ejecutados por GitHub Actions y Cloudflare Workers Builds.

---

## 1. Resultado esperado

```text
Usuarios UTEM
     │
     ▼
Cloudflare Access
     │
     ▼
Cloudflare Worker
Next.js + OpenNext
     │
     ▼
binding DB
     │
     ▼
Cloudflare D1
```

GitHub queda a cargo de:

- almacenar el código;
- controlar ramas y versiones;
- revisar cambios mediante pull requests;
- ejecutar la verificación continua.

Cloudflare queda a cargo de:

- compilar el proyecto desde GitHub;
- aplicar las migraciones pendientes de D1;
- desplegar el Worker;
- proporcionar la base D1;
- proteger el acceso institucional.

---

## 2. Descomprimir el pack

Descomprima el archivo de entrega en su equipo.

Debe cargar **el contenido interior** de la carpeta, no el ZIP ni una carpeta contenedora adicional. En la raíz del repositorio deben quedar visibles, entre otros:

```text
.github/
app/
features/
lib/
migrations/
prisma/
package.json
wrangler.jsonc
README.md
```

La entrega contiene menos de 100 archivos y ninguno supera 25 MiB, por lo que puede cargarse de una sola vez mediante GitHub web.

---

## 3. Crear la base D1 desde Cloudflare web

1. Ingrese al panel de Cloudflare.
2. Seleccione la cuenta correcta.
3. Abra **D1 SQL Database**.
4. Pulse **Create database**.
5. Nombre recomendado:

```text
postgrado-presupuestos-prod
```

6. En ubicación, utilice **Automatic**, salvo que la política institucional indique otra configuración.
7. Cree la base.
8. Copie el **Database ID** o UUID mostrado en la página de la base.

No ejecute todavía los archivos SQL desde la consola. Las migraciones se aplicarán durante el despliegue y quedarán registradas por D1.

---

## 4. Preparar `wrangler.jsonc`

Antes de conectar Cloudflare al repositorio, abra `wrangler.jsonc` en su equipo o edítelo después mediante GitHub web.

Reemplace:

```text
REEMPLAZAR_ID_D1_PRODUCCION
```

por el UUID de la base creada.

Mantenga:

```json
"binding": "DB",
"database_name": "postgrado-presupuestos-prod"
```

En el primer despliegue pueden quedar temporalmente pendientes los datos de Cloudflare Access:

```text
REEMPLAZAR_EQUIPO
REEMPLAZAR_AUD_DE_ACCESS
REEMPLAZAR_CORREO_UTEM
```

Sin Access configurado, la portada podrá desplegarse, pero las API institucionales responderán que el acceso aún no está configurado. Esto evita exponer datos mientras termina la configuración.

---

## 5. Crear el repositorio en GitHub web

1. Ingrese a GitHub.
2. Pulse **New repository**.
3. Nombre recomendado:

```text
sistema-presupuestos-postgrado-utem
```

4. Seleccione **Private**.
5. No agregue README, `.gitignore` ni licencia desde GitHub, porque ya están incluidos.
6. Cree el repositorio.

### Cargar el pack

1. En el repositorio vacío, pulse **uploading an existing file** o **Add file → Upload files**.
2. Abra la carpeta descomprimida en el Explorador de archivos.
3. Seleccione todos sus contenidos.
4. Arrástrelos al área de carga de GitHub.
5. Verifique que `package.json` quede en la raíz y no dentro de otra carpeta.
6. Mensaje de commit sugerido:

```text
chore: implementación inicial del sistema con Cloudflare D1
```

7. Confirme en `main` para esta carga inicial.

### Verificación visual mínima

En la raíz deben aparecer:

```text
package.json
wrangler.jsonc
README.md
```

Además, GitHub debe mostrar la carpeta oculta `.github`, que contiene el workflow de verificación.

---

## 6. Editar los valores de D1 desde GitHub web

Cuando el archivo aún contenga marcadores:

1. Abra `wrangler.jsonc` en GitHub.
2. Pulse el lápiz **Edit this file**.
3. Reemplace `REEMPLAZAR_ID_D1_PRODUCCION` por el UUID real.
4. Confirme el cambio.

No publique contraseñas, tokens ni claves en este archivo. El Database ID de D1 y el AUD de Access son identificadores de configuración, no contraseñas.

---

## 7. Conectar el repositorio en Cloudflare web

1. En Cloudflare, abra **Workers & Pages**.
2. Pulse **Create application**.
3. Seleccione la opción para importar o conectar un repositorio Git.
4. Autorice la aplicación de Cloudflare en GitHub, limitándola idealmente sólo a este repositorio.
5. Seleccione el repositorio.
6. Configure:

```text
Worker name: sistema-presupuestos-postgrado-utem
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
```

7. Para esta primera etapa, desactive los despliegues automáticos de ramas no productivas si la interfaz ofrece esa opción. Todas las ramas de preview compartirían el binding configurado en `wrangler.jsonc`; es más seguro incorporar posteriormente una base D1 separada para pruebas.
8. Pulse **Save and Deploy**.

### Qué hará el despliegue

Cloudflare ejecutará:

```text
npm install
npm run build
npm run deploy
```

El último comando:

1. aplica las migraciones D1 pendientes;
2. despliega la aplicación OpenNext;
3. vincula el Worker con la base mediante `DB`.

El nombre del Worker debe coincidir con el campo `name` de `wrangler.jsonc`.

---

## 8. Revisar el primer despliegue

Al finalizar, Cloudflare mostrará una dirección semejante a:

```text
https://sistema-presupuestos-postgrado-utem.<subdominio>.workers.dev
```

Compruebe:

```text
/api/health
```

Debe responder con `status: ok`.

La portada puede abrirse antes de configurar Access. Las funciones conectadas a D1 permanecerán protegidas y no admitirán una identidad no validada.

---

## 9. Verificar la base D1 desde la web

1. En Cloudflare, abra **D1 SQL Database**.
2. Seleccione `postgrado-presupuestos-prod`.
3. Abra **Console**.
4. Copie y ejecute las consultas de `database/d1/VERIFICAR_D1.sql`.

Resultados esperados:

```text
24 tablas funcionales
3 roles
3 plantillas
5 ítems iniciales de plantillas
15 parámetros institucionales
```

La tabla interna de migraciones de Cloudflare también debe reflejar `0001_initial.sql` y `0002_seed.sql`.

---

## 10. Configurar Cloudflare Access desde la web

Una vez conocida la URL del Worker:

1. Abra **Zero Trust** en Cloudflare.
2. Vaya a **Access controls → Applications**.
3. Pulse **Add an application**.
4. Seleccione **Self-hosted**.
5. Nombre sugerido:

```text
Sistema de Presupuestos de Postgrado UTEM
```

6. Agregue el dominio o URL pública del Worker, o preferentemente un dominio institucional propio.
7. Cree una política **Allow** para las cuentas, grupos o dominio institucional autorizado.
8. Configure MFA si la política de la Universidad lo permite.
9. Guarde la aplicación.
10. Copie el valor **Application Audience (AUD)**.
11. Identifique el dominio de equipo de Zero Trust, por ejemplo:

```text
https://nombre-equipo.cloudflareaccess.com
```

La aplicación valida firma, emisor y audiencia del JWT de Access antes de aceptar el correo institucional.

---

## 11. Completar Access en `wrangler.jsonc`

Desde GitHub web, edite `wrangler.jsonc` y reemplace:

```json
"CLOUDFLARE_ACCESS_TEAM_DOMAIN": "https://nombre-equipo.cloudflareaccess.com",
"CLOUDFLARE_ACCESS_AUD": "AUD_COPIADO_DESDE_ACCESS",
"BOOTSTRAP_ADMIN_EMAIL": "correo.inicial@utem.cl"
```

El correo debe ser exactamente el que utilizará en Cloudflare Access.

Confirme el cambio en `main`. Cloudflare detectará el commit y realizará un nuevo despliegue automáticamente.

---

## 12. Crear al administrador inicial

1. Abra la aplicación protegida.
2. Inicie sesión con el correo configurado en `BOOTSTRAP_ADMIN_EMAIL`.
3. En el primer acceso válido, el sistema crea ese usuario y le asigna temporalmente:
   - Gestor;
   - V°B°;
   - Aprobador.
4. Abra **Administración**.
5. Cree o habilite usuarios separados para cada función.
6. Reduzca posteriormente los roles del administrador inicial para respetar la segregación de funciones.

Recomendación de operación:

```text
Gestor: formula y ajusta
V°B°: revisa y observa
Aprobador: aprueba o devuelve
```

---

## 13. Probar el circuito funcional

Realice una prueba controlada:

1. Crear un programa.
2. Definir su arancel anual.
3. Crear una cohorte.
4. Aplicar una plantilla.
5. Agregar un descuento.
6. Agregar un ingreso extraordinario.
7. Agregar un costo único.
8. Agregar un costo compartido.
9. Activar normalización y alertas.
10. Registrar arrastre autorizado.
11. Guardar.
12. Exportar XLSX y PDF.
13. Enviar a V°B°.
14. Observar o derivar a aprobación.
15. Aprobar.
16. Revisar la versión y auditoría.
17. Revisar consolidado institucional, académico, profesional y por programa.

---

## 14. Protección del repositorio desde GitHub web

Después de la carga inicial:

1. Abra **Settings → Branches** o **Rules → Rulesets**, según la interfaz disponible.
2. Proteja `main`.
3. Exija pull request para cambios posteriores.
4. Exija que pase el workflow **Verificación continua**.
5. Evite commits directos a `main`.
6. Limite quién puede aprobar y fusionar cambios.

Para cambios ordinarios desde GitHub web:

1. Edite el archivo.
2. Seleccione **Create a new branch for this commit**.
3. Cree el pull request.
4. Espere la verificación.
5. Revise y fusione.
6. Cloudflare desplegará el cambio de `main`.

---

## 15. Crear una migración futura usando sólo GitHub web

Cuando cambie el modelo de datos:

1. Cree una nueva rama desde GitHub web.
2. Agregue un archivo SQL consecutivo, por ejemplo:

```text
migrations/0003_agrega_campo_respaldo.sql
```

3. Escriba una migración idempotente y compatible con SQLite/D1.
4. Actualice `prisma/schema.prisma` en la misma rama.
5. Cree un pull request.
6. Revise que GitHub Actions finalice correctamente.
7. Fusione a `main`.
8. Cloudflare ejecutará `wrangler d1 migrations apply DB --remote` y aplicará sólo las migraciones pendientes antes del despliegue.

**No copie esa misma migración manualmente a la consola de D1**, porque la estructura podría cambiar sin que el sistema de migraciones la registre.

Para cambios de alto riesgo, cree previamente otra base D1 y un Worker de prueba. Producción no es el mejor lugar para descubrir que un `ALTER TABLE` tenía personalidad propia.

---

## 16. Respaldo y recuperación

Antes de modificaciones relevantes:

1. Revise **Time Travel / Backups** dentro de la base D1.
2. Registre el bookmark o punto de recuperación disponible.
3. Descargue una exportación cuando corresponda a la política institucional.
4. Aplique la modificación mediante pull request.
5. Revise métricas, logs y consultas posteriores.

No elimine la base D1 para “empezar de nuevo” cuando ya contenga información oficial. Utilice migraciones y recuperación.

---

## 17. Restricciones conocidas y decisión técnica

Cloudflare D1 utiliza semántica SQLite. Prisma se integra mediante `@prisma/adapter-d1`; esta compatibilidad continúa identificada por Prisma como Preview. Además, Prisma no conserva garantías transaccionales en D1 para `$transaction`.

Por esta razón, el proyecto:

- no utiliza `$transaction`;
- emplea consultas Prisma para lecturas tipadas y operaciones simples;
- utiliza `D1Database.batch()` para escrituras críticas en múltiples tablas;
- conserva migraciones SQL D1 como fuente de verdad del esquema productivo.

Esta decisión reduce el riesgo de que un presupuesto quede guardado a medias entre cabecera, periodos, descuentos, ítems, versión y auditoría.

---

## 18. Configuración exacta resumida

### GitHub

```text
Repositorio: privado
Rama productiva: main
Workflow: .github/workflows/ci.yml
```

### Cloudflare Worker

```text
Name: sistema-presupuestos-postgrado-utem
Build: npm run build
Deploy: npm run deploy
Root: /
Production branch: main
```

### Cloudflare D1

```text
Database name: postgrado-presupuestos-prod
Binding: DB
Migrations directory: migrations
```

### Cloudflare Access

```text
Tipo: Self-hosted
Identidad: institucional
Variables: TEAM_DOMAIN + AUD + BOOTSTRAP_ADMIN_EMAIL
```

---

## 19. Archivos que no debe modificar durante la instalación

Salvo que exista una revisión técnica, no cambie:

```text
migrations/0001_initial.sql
migrations/0002_seed.sql
lib/calculations/
lib/database/d1-atomic.ts
lib/auth/api-access.ts
```

En `wrangler.jsonc`, modifique únicamente los marcadores `REEMPLAZAR_*` y, si corresponde, el nombre del Worker o de la base de forma consistente.
