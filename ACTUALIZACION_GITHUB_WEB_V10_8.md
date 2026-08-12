# Actualización v10.8 mediante GitHub web + Cloudflare

Esta guía está pensada para actualizar una instalación v10.7 que ya funciona en Cloudflare Workers y D1.

## Recomendación

Use el paquete incremental **actualizacion-v10-8-parametros-profesionales-github-web.zip**. Este paquete no incluye `wrangler.jsonc`, por lo que evita sobrescribir el `database_id`, variables y configuración productiva existente.

## Antes de subir

No cambie en Cloudflare:

- el binding D1 `DB`;
- `BOOTSTRAP_ADMIN_EMAIL`;
- el Secret `BOOTSTRAP_ADMIN_PASSWORD`;
- la configuración productiva de `wrangler.jsonc` que ya funciona.

La actualización no requiere borrar usuarios, programas ni presupuestos.

## Paso 1 — Descomprimir el paquete incremental

Descomprima `actualizacion-v10-8-parametros-profesionales-github-web.zip` en su computador.

La estructura conserva las mismas rutas del repositorio, por ejemplo:

```text
app/
features/
lib/
migrations/
prisma/
scripts/
tests/
package.json
```

## Paso 2 — Subir los archivos a GitHub

En GitHub, abra la rama que actualmente despliega Cloudflare.

Seleccione **Add file → Upload files** y cargue el contenido descomprimido respetando las carpetas/rutas. Los archivos con el mismo nombre deben reemplazar sus versiones actuales.

Archivo nuevo principal:

```text
migrations/0004_budget_professional_parameters.sql
```

No elimine `0001`, `0002` ni `0003`.

Commit sugerido:

```text
feat: v10.8 parámetros profesionales matrícula y prorrateos
```

## Paso 3 — Esperar el build de Cloudflare

Mantenga las configuraciones de build que ya funcionan:

```text
NODE_VERSION=22
SKIP_DEPENDENCY_INSTALL=1
```

Build command:

```text
npm install --include=dev --no-audit --no-fund && npm run build:cloudflare
```

Deploy command:

```text
npm run deploy:cloudflare
```

Durante el deploy, Wrangler aplicará automáticamente únicamente la migración D1 pendiente `0004_budget_professional_parameters.sql`.

No ejecute esa migración manualmente si el deploy la aplica correctamente.

## Paso 4 — Verificar la versión

Cuando termine el deploy, abra:

```text
https://SU-WORKER.workers.dev/api/version
```

Debe responder con:

```json
{
  "ok": true,
  "version": "1.0.18-d1-web",
  "release": "v10.8"
}
```

## Paso 5 — Verificar autenticación y APIs

Primero inicie sesión normalmente. Después revise:

```text
/api/me
/api/programs?includeInactive=1
/api/parameters
/api/budgets
```

Las cuatro rutas deben responder sin `Error interno`.

## Paso 6 — Prueba funcional recomendada

Cree o abra un Magíster Profesional y revise:

1. `Versión del programa / plan` es editable y `Revisión interna` permanece separada.
2. `Reconocimiento matrícula` comienza en 0 % en nuevos presupuestos.
3. En “Valores anuales” puede modificar hora docente directa, matrícula y guía de tesis.
4. La tabla indica los periodos reales de cobro de matrícula: uno por cada dos semestres.
5. Descuentos se ingresan como porcentaje visible `%` y afectan arancel y matrícula.
6. Becas aparecen deshabilitadas por defecto en un presupuesto profesional nuevo y pueden habilitarse con botón.
7. Un costo `Anual` aparece en todos los años activos desde el año seleccionado.
8. Dirección y Asistencia son editables por año.
9. Si existe otra cohorte/versión aprobada y superpuesta del mismo programa, se muestra como compromiso previo y el prorrateo sugerido es 50 % cuando existe una sola.
10. Overhead central y de facultad son editables por año y se calculan sobre arancel bruto − descuentos − incobrables.
11. En el flujo aparecen matrícula bruta, descuentos matrícula, matrícula neta y matrícula reconocida, pero `INGRESOS TOTAL (sin matrícula)` no incluye matrícula.

## Si el deploy informa que una columna ya existe

No vuelva a ejecutar SQL manualmente. Copie el mensaje completo del build/deploy. Esto puede indicar que la migración se ejecutó previamente fuera del historial de Wrangler y debe reconciliarse antes de repetirla.

## Paquete completo

También se entrega un ZIP completo v10.8 como respaldo. Si utiliza el paquete completo para reemplazar el repositorio, **conserve su `wrangler.jsonc` productivo actual**; el paquete incremental es la opción recomendada para una actualización sobre v10.7.
