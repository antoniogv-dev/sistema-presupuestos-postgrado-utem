# Verificación v10.14

Se realizaron las siguientes verificaciones antes de empaquetar:

- `tsc -p tsconfig.engine.json`: correcto para motor financiero y módulos PDF/XLSX.
- `preflight`: correcto usando configuración temporal de validación; 7 migraciones detectadas.
- `source:audit`: correcto; los marcadores funcionales v10.14 son obligatorios.
- XLSX real generado con 6 hojas.
- `Parámetros completos` contiene 134 registros de parámetros en el caso de prueba.
- Se verificó la presencia de parámetros de identificación, anuales, semestrales, descuentos, ingresos y costos.
- Búsqueda de errores Excel `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`: sin coincidencias.
- PDF real generado y renderizado: 4 páginas en el caso de prueba.
- Portada verificada visualmente con nombre del programa, versión y cohorte.
- Anexo PDF compacto: 59 registros relevantes en el caso de prueba, frente a 134 registros completos del Excel.
- `pdf_preflight.py`: PDF abierto correctamente, 4 páginas, no cifrado.
- El TSX de `BudgetWorkspace.tsx` fue analizado sintácticamente; sólo se obtuvieron los errores de imports esperables al no instalar dependencias completas en este entorno.

El build integral Next/OpenNext se debe validar en Cloudflare, que instala las dependencias del proyecto durante el build.
