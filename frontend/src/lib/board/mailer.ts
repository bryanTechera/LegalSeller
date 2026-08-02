import "server-only";

import { Resend } from "resend";

let cliente: Resend | null = null;

function getResend(): Resend {
  if (!cliente) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY no está configurada");
    cliente = new Resend(apiKey);
  }
  return cliente;
}

/**
 * HTML del magic link con la identidad Jurco (navy #132a3b sobre blanco
 * frío, acento acero #3185c9). El proyecto de referencia ~/observability
 * trae este template con la marca Colar: reusarlo haría que al equipo legal
 * le llegue un mail de acceso firmado por otro producto, que es exactamente
 * la pinta de un phishing.
 */
function renderHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:48px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e8ee;border-radius:10px;padding:40px 32px;">
            <tr>
              <td style="text-align:center;">
                <div style="font-size:22px;font-weight:700;color:#132a3b;letter-spacing:0.05em;margin-bottom:8px;">JURCO</div>
                <div style="font-size:13px;color:#64778a;margin-bottom:32px;">Acceso al board</div>
                <p style="color:#3c4f60;font-size:14px;line-height:1.6;margin:0 0 24px;">
                  Entrá al board con este enlace. Es válido por 24 horas y se puede usar una sola vez.
                </p>
                <a href="${url}" style="display:inline-block;background-color:#3185c9;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-weight:500;">Entrar al board</a>
                <p style="color:#64778a;font-size:12px;line-height:1.6;margin:32px 0 0;">
                  Si el botón no funciona, copiá este enlace en tu navegador:<br>
                  <span style="color:#9fb0bf;word-break:break-all;">${url}</span>
                </p>
                <p style="color:#9fb0bf;font-size:11px;margin:24px 0 0;">
                  Si no pediste este acceso, ignorá este mensaje.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function enviarMagicLink(params: { para: string; url: string }): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM no está configurada");
  const { error } = await getResend().emails.send({
    from,
    to: params.para,
    subject: "Tu acceso al board de Jurco",
    html: renderHtml(params.url),
    text: `Entrá al board con este enlace (válido 24 horas, un solo uso): ${params.url}`,
  });
  if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
}
