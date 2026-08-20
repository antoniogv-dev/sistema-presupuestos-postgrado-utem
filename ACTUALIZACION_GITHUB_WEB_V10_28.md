# Actualización v10.28

1. Aplicar el ZIP incremental sobre v10.27.
2. No reemplazar `wrangler.jsonc`.
3. No hay nueva migración D1.
4. Desplegar normalmente en Cloudflare.
5. Verificar `/api/version`: debe indicar `v10.28` y `1.0.38-d1-web`.

## Para mallas ya importadas con horas en cero
Si la malla se importó con v10.26/v10.27 desde encabezados de dos filas y los registros guardaron 0 tanto en trabajo directo como en Teoría/Laboratorio/Taller, reimporte el archivo en Programas, revise la vista previa y presione `Guardar modificaciones`. Luego vuelva al presupuesto y use `Aplicar malla curricular`.
