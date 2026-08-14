# Cambios v10.18 - Plantillas, modalidades, economías de escala, correo y relato financiero

## 1. Plantillas editables y versionadas

Las plantillas existentes pueden abrirse, modificarse y guardarse. Cada guardado incrementa su versión y genera trazabilidad en `AuditLog`. También se puede crear una plantilla nueva o clonar una existente.

Una plantilla puede aplicar a todos los programas de un tipo o asociarse a un programa específico.

## 2. Parámetros anuales y factor de actualización

Se agregó el tipo `PARAMETRO_ANUAL`. Las filas anuales permiten configurar valores para:

- Arancel.
- Matrícula.
- Beca de manutención mensual.
- Valor hora de docencia presencial.
- Valor hora de docencia sincrónica.
- Valor hora de docencia asincrónica.
- Guía de tesis.
- Dirección.
- Asistencia de Dirección.
- Otros honorarios no académicos.

Cada fila incorpora `Ajuste anual (%)` y el botón `Aplicar ajuste a todos los años`. El cálculo toma como base el primer año con un valor positivo y propaga el factor hacia adelante. Se mantiene además `Cargar referencia institucional` para partir desde los parámetros generales.

## 3. Modalidades de programas profesionales

Se incorporan tres plantillas profesionales base:

- Presencial.
- Semipresencial.
- E-learning.

Presencial utiliza horas presenciales. Semipresencial y E-learning separan:

- horas sincrónicas;
- horas asincrónicas;
- valor hora sincrónico;
- valor hora asincrónico.

Los valores son independientes por año y las horas son independientes por semestre.

## 4. Economías de escala y asignaturas compartidas

Las plantillas y los presupuestos pueden registrar asignaturas compartidas entre dos o más programas. Cada regla indica:

- asignatura;
- periodo;
- modalidad docente;
- horas compartidas;
- programas participantes;
- porcentaje de costo imputado al presupuesto.

El botón `Distribuir 100 % entre programas` propone una distribución uniforme (50 % para dos programas, 33,33 % para tres, etc.).

Una regla con menos de dos programas puede conservarse como borrador, pero no produce ahorro financiero. Cuando la regla es válida, el ahorro se calcula con el valor hora correspondiente a la modalidad y reduce el costo docente de la cohorte sin alterar las horas académicas registradas.

## 5. Avisos por correo en el flujo de aprobación

Antes de ejecutar una acción de workflow, el sistema solicita un destinatario. El desplegable prioriza usuarios activos con el rol correspondiente e incluye `Otros` para ingresar un correo manual.

El aviso identifica:

- programa;
- versión;
- cohorte;
- estado vigente;
- revisión interna;
- comentario de la acción;
- enlace directo al presupuesto.

Los mensajes se adaptan a la instancia: V°B°, aprobación, observación, aprobación final o consulta. Cada aviso queda registrado en `BudgetNotification`.

El envío automático es opcional mediante `RESEND_API_KEY` y `NOTIFICATION_FROM_EMAIL`. Sin esos secretos se genera un correo prellenado para envío manual.

## 6. Clonación y envío de presupuestos

`Clonar presupuesto` crea un nuevo presupuesto independiente en estado Borrador, conservando parámetros, periodos, descuentos, ingresos, costos, modalidad y reglas de economía de escala.

`Enviar por correo` comparte un presupuesto existente e identifica expresamente su estado y revisión.

## 7. Relato financiero en PDF

Se incorpora la sección `Análisis financiero y principales consideraciones`, generada exclusivamente desde los datos del presupuesto y sus parámetros. El PDF queda ordenado como:

1. Portada institucional.
2. Cuadro consolidado de ingresos, costos y flujo financiero.
3. Análisis financiero y principales consideraciones.
4. Parámetros principales utilizados.
5. Anexos, cuando corresponda.

El relato cubre identificación/contexto, ingresos, descuentos/becas, estudiantes equivalentes, matrícula informativa, incobrabilidad, docencia y valores hora, tesis, staff, costos materiales, overhead, economías de escala, prorrateos, evolución anual, arrastre, saldo acumulado, margen operacional, riesgos y conclusión financiera.

La conclusión diferencia programas profesionales de académicos/doctorales. No utiliza automáticamente expresiones administrativas como `se aprueba` o `se rechaza` y no atribuye fuentes institucionales de financiamiento que no estén registradas.

## 8. Migración D1

La migración `0008_templates_modalities_scale_notifications.sql`:

- amplía `BudgetTemplateItem` para `PARAMETRO_ANUAL`;
- agrega `settings` a plantillas;
- agrega modalidad al presupuesto;
- agrega horas sincrónicas y asincrónicas;
- agrega valores hora sincrónicos y asincrónicos por año;
- crea `SharedCourseEconomy`;
- crea `BudgetNotification`;
- incorpora las plantillas profesionales Presencial, Semipresencial y E-learning;
- agrega filas anuales editables a las plantillas base.
