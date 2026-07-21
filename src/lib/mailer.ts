import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const from = process.env.SMTP_FROM ?? "noreply@senchy.app"

  await transporter.sendMail({
    from: `"Senchy" <${from}>`,
    to,
    subject: "Réinitialisation de votre mot de passe",
    text: `
Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe Senchy.

Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe (valable 1 heure) :
${resetUrl}

Si vous n'avez pas fait cette demande, ignorez simplement cet email.

— L'équipe Senchy
    `.trim(),
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b,#064e3b);padding:32px 32px 24px;">
      <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">Senchy</h1>
      <p style="color:#6ee7b7;font-size:12px;margin:4px 0 0;">Bike Trip Planner</p>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px;">Réinitialisation du mot de passe</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien est valable <strong>1 heure</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#047857;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
        Réinitialiser mon mot de passe
      </a>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6;">
        Si vous n'avez pas fait cette demande, ignorez simplement cet email — votre mot de passe ne changera pas.<br><br>
        Lien direct : <a href="${resetUrl}" style="color:#059669;">${resetUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  })
}
