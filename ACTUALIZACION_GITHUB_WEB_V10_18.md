# Actualización GitHub Web v10.18

Versión: `1.0.28-d1-web`  
Release: `v10.18`

## Recomendación

Use el paquete incremental `actualizacion-acumulativa-v10-18-plantillas-modalidades-correo-relato-github-web.zip` sobre el repositorio que actualmente ejecuta v10.17.

El paquete incremental NO contiene `wrangler.jsonc`, por lo que no reemplaza el `database_id`, bindings, variables ni secretos de Cloudflare ya configurados.

## Actualización desde GitHub web

1. Abra el repositorio del Sistema de Presupuestos de Postgrado UTEM.
2. Cargue/reemplace los archivos del ZIP conservando exactamente las carpetas.
3. Confirme que se agregó `migrations/0008_templates_modalities_scale_notifications.sql`.
4. Confirme que `package.json` contiene `"version": "1.0.28-d1-web"`.
5. Confirme que `app/api/version/route.ts` contiene `release: "v10.18"`.
6. Haga el commit, por ejemplo: `feat: v10.18 plantillas, modalidades, correo y relato financiero`.
7. Espere el build y deploy automáticos de Cloudflare.

El comando de deploy existente ejecuta `wrangler d1 migrations apply DB --remote` antes de desplegar OpenNext, por lo que la migración 0008 se aplica automáticamente durante un deploy normal. No la ejecute manualmente si el deploy ya llegó a esa etapa correctamente.

## Comprobaciones después del despliegue

Abra `/api/version`. Debe mostrar:

```json
{
  "version": "1.0.28-d1-web",
  "release": "v10.18"
}
```

Luego compruebe:

- Plantillas: seleccionar una existente, modificarla y guardar; la versión de la plantilla debe incrementarse.
- Plantillas: editar el porcentaje `Ajuste anual (%)` y usar `Aplicar ajuste a todos los años`.
- Magíster profesional: cambiar entre Presencial, Semipresencial y E-learning.
- Semipresencial/E-learning: verificar horas y valores hora sincrónicos/asíncrónicos separados.
- Economías de escala: seleccionar dos o más programas y comprobar el porcentaje imputado.
- Presupuestos: `Clonar presupuesto` debe crear un nuevo borrador independiente.
- Presupuestos: `Enviar por correo` debe mostrar destinatarios y la alternativa `Otros`.
- Workflow: al Enviar a V°B°, Otorgar V°B°, Observar o Aprobar debe abrirse el selector de destinatario antes de completar el aviso.
- PDF: debe quedar en el orden Portada → Flujo → Análisis financiero y principales consideraciones → Parámetros principales.

## Envío automático de correos (opcional)

Sin configuración adicional, el sistema genera el asunto y cuerpo del aviso y abre el cliente de correo del usuario para su envío manual.

Para habilitar envío automático desde Cloudflare, configure en Worker > Settings > Variables and Secrets:

- `RESEND_API_KEY`: tipo **Secret**.
- `NOTIFICATION_FROM_EMAIL`: texto, con un remitente previamente verificado en el proveedor de correo.
- `PUBLIC_APP_URL`: texto opcional; puede contener la URL pública del sistema. Si no se define, se usa el origen del request.

No guarde `RESEND_API_KEY` en GitHub ni en `wrangler.jsonc`.
