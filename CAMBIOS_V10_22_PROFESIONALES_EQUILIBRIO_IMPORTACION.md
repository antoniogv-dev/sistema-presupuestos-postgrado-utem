# Cambios funcionales v10.22

## Formulación profesional
- `Valores anuales del presupuesto` ya no presenta `Valor hora docente directa`.
- `Valores hora según modalidad` presenta una sola tarifa visible: `Hora sincrónica`.
- La beca mensual de manutención profesional se resuelve en $0.
- La matrícula profesional usa como base 2027 = $192.150 y reajuste anual institucional.
- Plantillas profesionales se seleccionan dentro de `Parámetros y plantillas`.
- `Estudiantes iniciales` replica su valor a todos los semestres en `Estudiantes activos`.

## Staff
El bloque `Staff comprometido/prorrateable y overhead` incorpora un reajuste porcentual y una acción por año para proyectar hacia la anualidad siguiente:

- Dirección.
- Asistencia de Dirección.
- Otros honorarios no académicos.

## Costos base
Se eliminan referencias automáticas de:

- Gastos operacionales / Bienes y servicios.
- Software y licencias.
- Difusión.

La migración protege valores personalizados y sólo limpia coincidencias exactas con la antigua serie predeterminada.

## Punto de equilibrio
Para Magíster Profesional se calcula una cohorte sintética equivalente a arancel completo:

1. se mantienen costos, arrastre e ingresos extraordinarios del presupuesto;
2. se neutralizan descuentos y becas para expresar la demanda en matrículas equivalentes a arancel completo;
3. se busca mediante expansión y búsqueda binaria el menor número de equivalentes cuyo saldo acumulado final sea >= 0;
4. el resultado se redondea hacia arriba a 0,01 matrícula equivalente;
5. se informa además el entero de estudiantes a arancel completo aproximado.

Este indicador es un instrumento de viabilidad presupuestaria y no reemplaza la decisión formal de dictación.

## Importación inteligente
El nuevo motor `lib/import/budget-file-import.ts`:

- lee OOXML de `.xlsx/.xlsm` localmente;
- lee `.csv` y `.json`;
- reconoce la exportación `Parámetros completos` del sistema;
- reconoce tablas genéricas anuales y semestrales;
- detecta tablas de descuentos, costos e ingresos por sus encabezados;
- normaliza nombres, porcentajes, montos CLP y periodos `AAAA-1S/2S`;
- genera una vista previa con confianza, variables reconocidas, hojas y advertencias;
- sólo persiste después de confirmación y siempre como Borrador.

Cuando se incorpore un presupuesto externo representativo, sus nombres/campos se pueden agregar al catálogo de alias para aumentar la cobertura de reconocimiento sin alterar la arquitectura del importador.
