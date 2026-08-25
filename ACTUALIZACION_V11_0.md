# Sistema de Presupuestos de Postgrado UTEM — v11.0

Versión técnica: `1.1.0-d1-web`.

## Actualización mayor

Esta versión incorpora Planes Anuales de Dictación para Magísteres Profesionales:

- uno, dos o N inicios por año;
- posibilidad de más de un inicio dentro del mismo semestre;
- ventanas de dictación configurables por programa;
- cada inicio conserva su presupuesto/cohorte independiente;
- consolidación financiera anual;
- normalización de Dirección, Asistencia y otros honorarios no académicos para evitar duplicaciones entre cohortes;
- costos compartidos a nivel de programa;
- escenarios incrementales de 1 a N dictaciones;
- punto de equilibrio anual en matrículas equivalentes;
- exportación XLSX y PDF del Plan Anual;
- botón `Descargar memorándum` nuevamente disponible;
- corrección del arancel anual por ciclo académico de la cohorte, particularmente para inicios en segundo semestre;
- migración D1 `0011_professional_annual_offering_plans.sql`.

## Aplicación de la actualización

1. Respaldar el repositorio y la base D1 productiva.
2. Para actualización incremental, copiar el contenido del ZIP `actualizacion-mayor-v11-0-planes-anuales-profesionales-n-inicios-github-web.zip` sobre el repositorio v10.32.
3. Para instalación completa, utilizar `sistema-presupuestos-postgrado-utem-d1-github-web-v11-0.zip`.
4. Mantener el `wrangler.jsonc` productivo existente; no se incluye uno nuevo en los ZIP.
5. Aplicar la migración `0011_professional_annual_offering_plans.sql` después de las migraciones anteriores.
6. Ejecutar el pipeline normal de Cloudflare (`npm install --include=dev --no-audit --no-fund && npm run build:cloudflare`).

## Controles ejecutados antes del empaquetado

- `tsc -p tsconfig.engine.json`: correcto.
- Preflight: correcto con 11 migraciones.
- Source audit: correcto.
- Auditoría transversal: 12/12 controles correctos.
- Sintaxis TS/TSX de los componentes v11: correcta.
- Migraciones 0001 a 0011 aplicadas secuencialmente sobre SQLite limpio: correctas.
- Prueba de cohorte de cuatro semestres con inicio en 2S: factores de arancel por año `1, 1, 0`.
- Prueba de Plan Anual con tres inicios: consolidación, tres escenarios, normalización de staff y punto de equilibrio operativos.

## Observación de despliegue

El repositorio mantiene la misma arquitectura Next.js/OpenNext/Cloudflare D1 de v10.32. El archivo `wrangler.jsonc` no se incorpora deliberadamente para no reemplazar la configuración productiva ni secretos del despliegue actual.
