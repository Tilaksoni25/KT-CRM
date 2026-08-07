const wrapHtml = (bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #1f6feb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; }
    .footer { margin-top: 24px; color: #777; font-size: 12px; }
    .card { border: 1px solid #e1e5eb; border-radius: 10px; padding: 20px; background: #ffffff; }
    .hero { font-size: 20px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;

const buildInviteEmailContent = (inviterCompanyName, inviteLink) => {
  const subject = `You've been invited to join ${inviterCompanyName} on Kevalon ERP`;
  const text = `You have been invited to join ${inviterCompanyName} on Kevalon ERP.\n\nPlease click the link below to set your password and activate your account (valid for 48 hours):\n\n${inviteLink}\n\nIf you did not expect this invite, you can safely ignore this email.`;
  const html = wrapHtml(`
    <p class="hero">Hello,</p>
    <p>You have been invited to join <strong>${inviterCompanyName}</strong> on <strong>Kevalon ERP</strong>.</p>
    <p>Click the button below to set your password and activate your account. The link is valid for 48 hours.</p>
    <p><a class="button" href="${inviteLink}">${inviteLink}</a></p>
    <p>If the button does not work, copy and paste this URL into your browser:</p>
    <p>${inviteLink}</p>
    <p>If you did not expect this invite, please ignore this email or contact your administrator.</p>
  `);

  return { subject, text, html };
};

const buildTemporaryPasswordEmailContent = (inviterCompanyName, toEmail, temporaryPassword, loginUrl) => {
  const subject = `Welcome to Kevalon Finance | ${inviterCompanyName}`;
  const text = `Hello,\n\nYou have been registered on Kevalon Finance for ${inviterCompanyName}.\n\nEmail: ${toEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease log in at ${loginUrl} and change your password immediately.\n\nIf you did not expect this email, please contact your administrator.`;
  const html = wrapHtml(`
    <p class="hero">Welcome to Kevalon Finance!</p>
    <p>You have been registered for <strong>${inviterCompanyName}</strong>.</p>
    <p><strong>Login Email:</strong> ${toEmail}</p>
    <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
    <p>Please log in and change your password immediately.</p>
    <p><a class="button" href="${loginUrl}">Log in to Kevalon Finance</a></p>
    <p>If the button does not work, use this URL:</p>
    <p>${loginUrl}</p>
    <p>If you did not expect this email, please contact your administrator.</p>
  `);

  return { subject, text, html };
};

module.exports = {
  buildInviteEmailContent,
  buildTemporaryPasswordEmailContent
};
