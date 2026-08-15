# Corrección de build v10.18 — plantillas y relato financiero

El build de Cloudflare superó Prisma, preflight, source:audit, typecheck y lint. Se detuvo en Vitest por dos pruebas de v10.18.

## Corrección 1 — parámetros anuales de plantilla

`demoBudget` y algunos presupuestos recién creados pueden tener `annualOverrides` vacío. La aplicación de una plantilla anual sólo recorría overrides existentes, por lo que no había años sobre los cuales escribir arancel, docencia sincrónica o asincrónica.

Se corrige `applyBudgetTemplate` para aceptar opcionalmente `InstitutionalParameters` y, cuando la plantilla contiene parámetros anuales, hidratar primero todos los años activos mediante `hydrateAnnualOverrides`.

`BudgetWorkspace` pasa ahora los parámetros institucionales al aplicar la plantilla.

## Corrección 2 — prueba del relato financiero

El título `Análisis financiero y principales consideraciones` ya se genera correctamente como `narrative.title` y el PDF lo imprime como título de la sección. La prueba sólo concatenaba `sections` y omitía deliberadamente `title`, por lo que fallaba aunque el informe fuera correcto.

Se corrige la prueba para evaluar `narrative.title` junto con las secciones.

## Validaciones realizadas

- Compilación estricta del núcleo financiero (`tsconfig.engine.json`): correcta.
- Prueba manual equivalente de aplicación de plantilla: arancel 2027 = $5.000.000; valores sincrónicos/asincrónicos 2028 correctos.
- Prueba manual equivalente del relato financiero: título, arancel bruto, incobrabilidad, matrícula informativa y conclusión presentes; sin lenguaje administrativo de aprobación.
- 12/12 pruebas standalone del motor: aprobadas.
- `preflight`: correcto con configuración de validación temporal.
- `source:audit`: correcto; sólo advertencias esperables de placeholders de validación.

No se modifica D1, no se agregan migraciones y la versión permanece en v10.18 / 1.0.28-d1-web porque el despliegue anterior no se completó.
