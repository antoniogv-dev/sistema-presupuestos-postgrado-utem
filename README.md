# Sistema de Presupuestos de Postgrado UTEM — v10.23 · GitHub web + Cloudflare D1

Aplicación institucional para formular, revisar, consolidar y exportar presupuestos de cohortes de programas de postgrado. Esta edición está preparada para operar con GitHub web, Cloudflare Workers/OpenNext y Cloudflare D1.



## Mejoras funcionales v10.23

- **Identidad programa-presupuesto inmutable:** un presupuesto existente ya no puede reasignarse desde MGIB a MDTIS, MGP u otro programa. El programa queda de sólo lectura dentro de Identificación y la API rechaza cambios de `programId`.
- **Selección simplificada y canónica:** la cabecera usa `Programa` y `Presupuesto / cohorte`; al cambiar se vuelve a leer el presupuesto exacto por ID desde D1 y toda la página se sincroniza con él. Se elimina el estado candidato que podía diferir del presupuesto activo.
- **Nombre institucional completo:** el presupuesto activo y la Identificación muestran código y nombre completo del programa, por ejemplo `MGIB · Magíster en Gestión de la Información y Bibliotecología`.
- **Auditoría de integridad en pantalla:** detecta cohortes rotuladas con el código de otro programa, plantillas incompatibles, periodos incongruentes y otros desajustes. Los errores de identidad bloquean Guardar, correo y workflow hasta corregirse.
- **Plantillas aisladas:** una plantilla específica sólo aparece y se aplica al programa para el cual fue creada. Las APIs de plantillas y presupuestos verifican además tipo y programa.
- **Importación segura:** si un archivo no identifica con suficiente precisión el programa, el importador ya no selecciona silenciosamente el primer programa; exige selección explícita.
- **Workflow consistente:** no permite enviar por correo, V°B° o aprobación mientras existan cambios locales sin guardar o errores de identidad.
- **Auditoría transversal permanente:** `npm run integrity:audit` ejecuta 12 controles de aislamiento e identidad dentro del build de Cloudflare.
- **Se mantienen las mejoras v10.22:** simplificación profesional, matrícula 2027 en $192.150, manutención profesional inicial en $0, reajuste de staff, autocompletado de estudiantes, punto de equilibrio e importación inteligente.
- **Control de despliegue:** versión `v10.23 · 1.0.33-d1-web`.

## Mejora funcional v10.21

- **Selector con aplicación explícita:** elegir otro presupuesto en el desplegable superior no modifica inmediatamente el formulario; el cambio se ejecuta sólo con `Aplicar filtro`.
- **Edición aislada por presupuesto:** el formulario trabaja sobre una copia local `draftBudget`; los demás presupuestos cargados desde D1 permanecen sin alteraciones.
- **Protección de cambios no guardados:** al cambiar de presupuesto se solicita confirmación antes de descartar el borrador local, y el navegador advierte si se intenta salir con cambios pendientes.
- **Contexto visible:** la cabecera identifica permanentemente el `Presupuesto activo` con programa, cohorte, versión y revisión.
- **Recarga segura:** `Recargar activo` permite descartar cambios locales y volver a obtener el presupuesto desde D1.
- **Control de despliegue:** versión `v10.21 · 1.0.31-d1-web`.

## Correcciones funcionales v10.20

- **Plantillas profesionales editables y verificadas:** el guardado de una plantilla existente se realiza directamente en D1, normaliza claves de filas, incrementa la versión y vuelve a leer el registro persistido antes de confirmar éxito en pantalla.
- **Matrícula profesional anual corregida:** se cobra una sola vez por cada bloque de dos semestres desde el ingreso de la cohorte, usando los estudiantes activos del semestre en que corresponde el cobro. Funciona para cohortes que comienzan en 1S o 2S.
- **Matrícula sin descuentos y fuera de ingresos:** los descuentos siguen afectando exclusivamente al arancel; la matrícula se mantiene informativa y no integra `INGRESOS TOTAL`.
- **Recuperación de registros históricos:** si una anualidad antigua quedó con matrícula `0` por ausencia del parámetro, se utiliza la referencia anual institucional/plantilla vigente para ese año.
- **Trazabilidad en pantalla:** la tabla anual muestra el periodo de cobro y los estudiantes utilizados para calcular la matrícula.
- **Control de despliegue:** versión `v10.20 · 1.0.30-d1-web`.

## Mejoras funcionales v10.19

- **Dos consolidados institucionales separados:** `Aprobados` incluye exclusivamente presupuestos en estado Aprobado; `Activos` incluye En revisión, Observado y Aprobado. Los estados Borrador y Reemplazado nunca se suman.
- **Consolidados por programa sin borradores:** las vistas académica, profesional y por programa usan sólo presupuestos activos, evitando que un presupuesto todavía en formulación distorsione los resultados.
- **Valor base manual en plantillas:** cada parámetro anual permite elegir año base, reemplazar manualmente el valor inicial y definir un reajuste anual propio.
- **Proyección desde el nuevo valor base:** el botón `Proyectar reajuste desde valor base` recalcula el año base y todos los años posteriores. Si se modifica directamente la celda del año base, ese valor también queda como nueva base.
- **Compatibilidad con plantillas existentes:** si una plantilla antigua no tiene `baseYear` o `baseValue`, la interfaz deriva automáticamente la primera referencia positiva disponible.
- **Sin migración D1 nueva:** los nuevos campos de proyección se guardan dentro del JSON de configuración de cada fila de plantilla.
- **Control de despliegue:** versión `v10.19 · 1.0.29-d1-web`.

## Mejoras funcionales v10.18

- **Plantillas editables y versionadas:** las plantillas existentes pueden modificarse, guardarse, clonarse o asociarse a un programa específico.
- **Ajuste anual por fila:** Arancel, Matrícula, Manutención, Docencia, Guía de tesis, Dirección, Asistencia y otros honorarios incorporan factor manual y botón `Aplicar ajuste a todos los años`.
- **Modalidades profesionales:** Presencial, Semipresencial y E-learning; estas últimas separan horas y valores hora sincrónicos/asíncrónicos.
- **Economías de escala:** asignaturas compartidas entre dos o más programas, con horas, modalidad y porcentaje de costo imputado. Una regla incompleta no genera ahorro.
- **Workflow con avisos:** V°B°, aprobación, observación y envío manual permiten seleccionar destinatario y usar `Otros` para un correo no registrado.
- **Correo con estado:** los avisos identifican programa, versión, cohorte, revisión y estado. El envío automático es opcional; sin proveedor se prepara un correo manual.
- **Clonación de presupuestos:** crea un nuevo borrador independiente conservando los parámetros de formulación.
- **PDF con relato financiero:** después del flujo se incorpora `Análisis financiero y principales consideraciones`, construido sólo desde los datos y parámetros del presupuesto.
- **Migración D1 0008:** agrega parámetros anuales de plantillas, modalidades, horas sync/async, economías de escala y registro de notificaciones.
- **Control de despliegue:** versión `v10.18 · 1.0.28-d1-web`.

## Mejoras funcionales v10.17

- **Corrección XLSX Microsoft Excel:** se corrige la estructura OOXML que provocaba el mensaje de reparación de `sheet*.xml`; los parámetros quedan visibles tanto en `Presupuesto completo` como en `Parámetros completos`.

- **Subtotales financieros:** el flujo separa Honorarios académicos, Honorarios no académicos y Otros gastos.
- **Subtotales condicionales:** Equipamientos y Becas y ayudas sólo aparecen cuando existe un monto asociado.
- **Clasificación de costos:** se incorporan las categorías `Equipamiento` y `Becas y ayudas` para costos manuales y plantillas.
- **Exportaciones alineadas:** XLSX y PDF utilizan exactamente la misma estructura de subtotales que el flujo en pantalla.

- **XLSX visible desde la primera hoja:** la pestaña inicial `Presupuesto completo` contiene el flujo y, a continuación, la tabla `PARÁMETROS COMPLETOS UTILIZADOS EN EL CÁLCULO`. Ya no depende de que el usuario cambie de pestaña para ver los parámetros.
- **Trazabilidad XLSX redundante y verificable:** se conservan además las pestañas `Flujo presupuestario`, `Parámetros completos`, `Parámetros anuales`, `Parámetros semestrales`, `Descuentos` y `Costos e ingresos`.
- **PDF completamente vertical:** portada, flujo y anexo de parámetros se generan en A4 vertical (595 x 842 pt).
- **Flujo PDF legible:** si un presupuesto abarca más de tres años, el flujo se divide por bloques de hasta tres años sin perder filas ni valores.
- **Portada completa sin recorte:** la imagen institucional se ajusta dentro de la página vertical conservando la composición original.
- **Control de despliegue:** versión `v10.17 · 1.0.27-d1-web`; `source:audit` exige la primera hoja completa y el PDF vertical.
- **Sin migración D1 nueva:** esta versión modifica exclusivamente presentación/exportación y control de release.

## Mejoras funcionales v10.14

- **Costos realmente removibles desde el flujo:** cada costo/gasto manual aparece como una fila propia `Costo: ...`, con categoría, periodicidad, alcance y botón visible `Quitar`. La eliminación solicita confirmación y queda pendiente de persistir con `Guardar cambios`.
- **Alta de costos también desde el flujo:** el encabezado de `Flujo de caja anual` incorpora `Agregar costo al flujo`, además del editor detallado de la sección de costos.
- **PDF con portada institucional verificada:** usa la portada proporcionada por la Escuela de Postgrado y superpone el nombre del programa en gran formato, centrado en la zona media y alineado a la derecha. Debajo muestra `Versión` y `Cohorte` en líneas separadas.
- **PDF depurado:** el anexo incluye identificación esencial, parámetros anuales principales, carga semestral relevante y cualquier descuento, ingreso o costo que efectivamente tenga información. Se omiten filas vacías o controles secundarios sin uso.
- **Excel con trazabilidad inequívoca:** el libro individual contiene seis hojas: `Flujo presupuestario`, `Parámetros completos`, `Parámetros anuales`, `Parámetros semestrales`, `Descuentos` y `Costos e ingresos`. `Parámetros completos` mantiene todos los inputs del cálculo, incluidos ceros y registros detallados.
- **Control de despliegue reforzado:** la aplicación muestra `v10.14 · 1.0.24-d1-web` y `source:audit` falla si faltan las hojas de Excel, la portada o la acción de quitar costos.
- **Sin nueva migración D1:** v10.14 no cambia el esquema ni las fórmulas financieras.

## Mejoras funcionales v10.12

- **XLSX con trazabilidad completa:** cada presupuesto individual incorpora una segunda hoja de parámetros.
- **PDF con anexo de parámetros:** después del flujo presupuestario se agregan páginas con los parámetros efectivos utilizados en el cálculo.
- **Sin alterar cálculos:** esta versión agregó trazabilidad documental y se mantiene como base de v10.13.

## Mejoras funcionales v10.11

- **Flujo de caja como fuente principal de lectura de egresos:** los costos registrados en la sección “Costos y gastos” se integran dentro de la categoría correspondiente del flujo anual. Se elimina el bloque independiente “Detalle de costos y gastos registrados”.
- **Sin “Honorarios académicos adicionales”:** los costos académicos del flujo son horas docentes directas, horas docentes de reemplazo y guía de tesis.
- **Honorarios no académicos como subtotal de staff:** el subtotal corresponde a Dirección + Asistencia de dirección + Otros honorarios no académicos.
- **Otros honorarios no académicos prorrateables:** se parametrizan por año y pueden prorratearse en programas profesionales, igual que Dirección y Asistencia de dirección.
- **Categorías editables directamente en el flujo por año:** Gastos operacionales / Bienes y servicios, Software y licencias, Difusión, Congresos y pasantías, Libros y publicaciones, Pasajes y fletes, Viáticos, Alimentos y bebidas y Otros costos y gastos.
- **Costos nominados integrados:** cada registro manual aparece inmediatamente debajo de su categoría en el mismo flujo con el prefijo “Incluido:”, sin duplicarse en la sumatoria.
- **Persistencia D1:** los montos anuales editables del flujo y el nuevo staff se guardan en `BudgetAnnualOverride`.
- **Compatibilidad histórica:** las categorías antiguas se normalizan mediante la migración `0007_cashflow_editable_staff_and_costs.sql` sin eliminar registros.
- **Exportaciones alineadas:** XLSX/PDF usan la misma estructura conceptual del flujo v10.11.
## Reglas financieras vigentes

- La matrícula es anual, informativa y no recibe descuentos. No forma parte de `INGRESOS TOTAL`.
- Los descuentos de cohorte se aplican exclusivamente al arancel.
- El arancel se calcula para cada año activo del presupuesto.
- El overhead anual se calcula sobre arancel bruto menos descuentos de arancel menos incobrables.
- Un costo con periodicidad `Anual` se repite desde su año de inicio mientras existan años activos del presupuesto.
- Los costos nominados se suman a la categoría correspondiente del flujo; las líneas “Incluido:” son sólo trazabilidad visual y no vuelven a sumarse.

## Configuración Cloudflare Builds

Variables de build recomendadas:

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

## Migraciones D1

El proyecto contiene ocho migraciones, en este orden:

```text
0001_initial.sql
0002_seed.sql
0003_functional_improvements.sql
0004_budget_professional_parameters.sql
0005_cashflow_costs_and_annual_tuition.sql
0006_repair_annual_tuition_and_enrollment_rules.sql
0007_cashflow_editable_staff_and_costs.sql
0008_templates_modalities_scale_notifications.sql
```

El despliegue aplica automáticamente sólo las migraciones pendientes mediante:

```bash
wrangler d1 migrations apply DB --remote
```

No vuelva a ejecutar manualmente migraciones que Cloudflare ya tenga registradas.

## Autenticación y seguridad

- `BOOTSTRAP_ADMIN_PASSWORD` debe mantenerse como Secret de Cloudflare y nunca almacenarse en GitHub.
- PBKDF2 utiliza 100.000 iteraciones, compatible con el runtime actualmente utilizado.
- El proyecto conserva sesiones internas HTTP-only, roles segregados y auditoría de cambios.
- El paquete incremental de actualización no debe reemplazar el `wrangler.jsonc` productivo.

## Validación automatizada

`npm run build:cloudflare` ejecuta antes de OpenNext:

```text
Prisma generate
→ preflight
→ source audit
→ TypeScript
→ ESLint
→ motor financiero
→ Vitest
→ pruebas autónomas
→ OpenNext
```

## Documentación de esta versión

- `ACTUALIZACION_GITHUB_WEB_V10_11.md`
- `CAMBIOS_V10_11_FLUJO_EDITABLE_STAFF_COSTOS.md`
- `VERIFICACION_V10_11.md`
- `migrations/LEAME.md`
