# v10.27 · Aplicación efectiva de malla, equilibrio y defaults de formulación

## Corrección principal

La v10.26 podía aplicar correctamente horas sincrónicas/asincrónicas desde la malla, pero una cohorte con modalidad global Presencial ocultaba esas bolsas de horas y mostraba sólo horas presenciales. Esto hacía parecer que “Aplicar malla curricular” no funcionaba.

v10.27 muestra las tres bolsas de carga docente cuando existe malla vinculada (presencial, sincrónica y asincrónica), sin alterar la valorización del motor. El botón entrega además un resumen de horas cargadas o una advertencia si la malla no contiene horas valorizables.

## Sugerencia de equilibrio

Junto a “Aplicar malla curricular” se agrega “Sugerir equilibrio” para Magíster Profesional. El botón aplica primero la malla vigente y luego calcula el punto de equilibrio, mostrando matrículas equivalentes mínimas y su aproximación a estudiantes a arancel completo. No modifica automáticamente la matrícula del presupuesto.

## Estudiantes y graduación

Al modificar Estudiantes iniciales:
- se replica el valor en Estudiantes activos de todos los semestres;
- el último semestre recibe el mismo valor en Estudiantes en graduación;
- los semestres anteriores conservan sus ajustes manuales de graduación.

La misma regla se aplica al regenerar periodos por cambios en año, semestre de inicio o duración.

## Descuentos

Un descuento nuevo comienza en el primer semestre de la cohorte y, por defecto, termina en el último semestre configurado. El usuario puede modificar manualmente ambos extremos después.

## Base de datos

No se agrega migración D1 nueva. Se mantienen las migraciones 0001–0010.

## Lectura de la malla desde D1

Al presionar Aplicar malla curricular o Sugerir equilibrio, la plataforma vuelve a consultar `/api/programs/[programId]` con `no-store` y utiliza la malla persistida más reciente. Si la importación quedó sólo en el formulario de Programas y no se guardó, el presupuesto informa expresamente que debe presionarse Guardar modificaciones.
