# Cambios funcionales v10.20

## 1. Guardado de plantillas profesionales

Se reforzó el flujo de actualización de plantillas existentes:

- el `PUT /api/templates/:id` trabaja directamente sobre D1;
- elimina y vuelve a insertar las filas de la plantilla dentro de un batch atómico;
- normaliza claves duplicadas de ítems antes de persistir;
- incrementa la versión de la plantilla;
- registra auditoría;
- vuelve a leer la plantilla desde D1 y devuelve exactamente lo persistido;
- la interfaz vuelve a cargar la plantilla guardada antes de informar éxito.

Esto evita que una modificación aparezca sólo en el estado local del navegador o que una escritura válida sea seguida por una lectura incompatible.

## 2. Cálculo de matrícula en programas profesionales

La regla queda definida así:

- **una matrícula por cada bloque de dos semestres** contado desde el semestre de ingreso;
- el monto del año utiliza el valor anual de matrícula correspondiente;
- la cantidad se multiplica por los **estudiantes activos del semestre en que corresponde el cobro**;
- funciona tanto para cohortes 1S como 2S;
- no se generan cobros en semestres parciales fuera del ciclo anual de la cohorte.

Ejemplo, programa de 4 semestres iniciado en 2027-2S:

- 2027-2S: cobra matrícula a estudiantes activos de 2027-2S;
- 2028-2S: cobra matrícula a estudiantes activos de 2028-2S;
- 2029-1S: no cobra una tercera matrícula.

## 3. Separación matrícula / arancel

- Los descuentos de cohorte se aplican exclusivamente al arancel.
- `Descuentos matrícula = 0` por diseño.
- La matrícula se visualiza como antecedente informativo.
- La matrícula no integra `INGRESOS TOTAL`.
- El reconocimiento de matrícula conserva su parámetro independiente.

## 4. Compatibilidad con presupuestos históricos

Cuando un `BudgetAnnualOverride` antiguo contiene `annualEnrollmentFee = 0` porque esa anualidad fue creada antes de persistir correctamente el parámetro, el motor utiliza la referencia institucional/plantilla del año. Así se evita que una cohorte histórica pierda el cobro de matrícula por un cero técnico.

## 5. Interfaz

La tabla de valores anuales incorpora:

- periodo de cobro de matrícula;
- estudiantes considerados para matrícula;
- valor anual de matrícula editable sólo cuando corresponde cobro en ese año.
