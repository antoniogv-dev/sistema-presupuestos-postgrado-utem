# Actualización v10.22 — Formulación profesional, punto de equilibrio e importación local

Versión: **v10.22 / 1.0.32-d1-web**

## Objetivo
Ajustar la formulación de programas profesionales, eliminar valores de referencia no deseados, incorporar un punto de equilibrio financiero y habilitar una importación local que reconstruya un presupuesto desde archivos estructurados.

## Cambios principales

1. **Valores anuales simplificados**
   - Se elimina la columna `Valor hora docente directa` de `Valores anuales del presupuesto`.
   - Para programas profesionales, `Valores hora según modalidad` presenta un único `Hora sincrónica`.
   - Ese valor se utiliza como referencia horaria única interna para la valorización profesional, evitando tarifas ocultas distintas.

2. **Reglas profesionales iniciales**
   - Beca de manutención mensual: **$0**.
   - Matrícula profesional 2027: **$192.150**.
   - La serie profesional se reajusta desde esa base con el reajuste anual institucional; con 5 %, 2028 corresponde a **$201.758**.

3. **Staff**
   - Se agrega un porcentaje de reajuste y un botón `Aplicar → siguiente año` en cada anualidad.
   - El botón proyecta Dirección, Asistencia de Dirección y Otros honorarios no académicos.

4. **Plantillas**
   - `Usar plantilla` queda dentro de `Parámetros y plantillas`.
   - En Magíster Profesional muestra las plantillas activas Presencial, Semipresencial y E-learning.

5. **Estudiantes iniciales**
   - Al modificar `Estudiantes iniciales`, el mismo valor se replica automáticamente en `Estudiantes activos` de todos los semestres activos.
   - Posteriormente cada semestre puede modificarse individualmente.

6. **Costos de referencia eliminados**
   - Gastos operacionales / bienes y servicios, Software y licencias y Difusión parten en **$0**.
   - La migración 0009 limpia tanto parámetros institucionales sembrados como overrides de presupuestos que todavía conservan exactamente los valores históricos por defecto, sin tocar montos personalizados.

7. **Punto de equilibrio profesional**
   - Se calcula la cantidad mínima de **matrículas equivalentes a arancel completo** necesaria para que el saldo acumulado final sea igual o superior a cero.
   - El umbral equivalente se redondea hacia arriba a dos decimales, de modo que el flujo quede próximo a cero pero no negativo.
   - Se muestra también el número entero aproximado de estudiantes a arancel completo.
   - El punto de equilibrio se incorpora a la pantalla, al anexo de parámetros y al relato financiero del PDF.

8. **Importación local de presupuestos**
   - Se habilita `Buscar archivo local` para `.xlsx`, `.xlsm`, `.csv` y `.json`.
   - El análisis ocurre primero en el navegador; no se escribe en D1 durante la lectura.
   - Reconoce identidad, años, semestres, estudiantes, arancel, matrícula, horas, staff, overhead, descuentos, ingresos extraordinarios y costos/gastos.
   - Entiende directamente la hoja `Parámetros completos` generada por el propio sistema y utiliza heurísticas por encabezados/etiquetas para planillas externas.
   - Un archivo interpretado se crea siempre como **Borrador** y requiere revisión humana antes del flujo formal.

## Migración D1
Se agrega:

`migrations/0009_remove_seeded_operational_defaults.sql`

La migración no elimina registros. Corrige únicamente valores históricos que coinciden exactamente con defaults conocidos.

## Actualización recomendada
Suba el paquete incremental sobre v10.21 y permita que Cloudflare ejecute el build/deploy normal. No reemplace `wrangler.jsonc` ni sus Secrets.
