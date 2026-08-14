# Configuración opcional de avisos automáticos por correo - v10.18

El sistema funciona sin proveedor de correo: prepara asunto/cuerpo y abre el cliente de correo del usuario.

Si se desea envío automático:

1. Cloudflare > Workers & Pages > Sistema de Presupuestos > Settings > Variables and Secrets.
2. Agregar `RESEND_API_KEY` como **Secret**.
3. Agregar `NOTIFICATION_FROM_EMAIL` como variable de texto con un remitente verificado.
4. Opcionalmente agregar `PUBLIC_APP_URL` con la URL pública del sistema.
5. Desplegar nuevamente el Worker si Cloudflare lo solicita.

El sistema nunca requiere que `RESEND_API_KEY` sea almacenado en GitHub.

Si el proveedor de correo falla, la acción de workflow no se revierte: el aviso queda preparado y el sistema ofrece el envío manual. Esto evita que una caída del proveedor de correo bloquee la aprobación presupuestaria.
