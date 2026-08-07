const nodemailer = require('nodemailer');
const env = require('../config/env');
const pino = require('pino');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

let transporter = null;

// Initialize Nodemailer transporter if SMTP config is present
if (env.SMTP_HOST && env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // standard TLS
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

/**
 * Send an email using nodemailer or log it if SMTP is not configured
 * @param {object} options - { to, subject, text, html }
 * @returns {Promise<object>}
 */
const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    logger.info(`📧 [MOCK EMAIL] --- Sending Simulated Email ---`);
    logger.info(`📧 [MOCK EMAIL] To: ${to}`);
    logger.info(`📧 [MOCK EMAIL] Subject: ${subject}`);
    logger.info(`📧 [MOCK EMAIL] Text Body: \n${text}\n`);
    logger.info(`📧 [MOCK EMAIL] ---------------------------------`);
    return { messageId: 'mock-id-12345', preview: true };
  }

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html
    });
    logger.info(`📧 Email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`❌ SMTP transport failed to send email to ${to}: ${error.message}`);
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      logger.info(`📧 [FALLBACK EMAIL LOG] To: ${to} | Subject: ${subject} | Body: ${text}`);
      return { messageId: 'fallback-id-12345', preview: true, error: error.message };
    }
    throw error;
  }
};

/**
 * Send an email-verification link to a new user
 * @param {string} toEmail
 * @param {string} plainToken - the raw (unhashed) token to embed in the URL
 */
const sendVerificationEmail = async (toEmail, plainToken) => {
  const verifyLink = `${env.CLIENT_URL}/verify-email?token=${plainToken}`;
  const subject = 'Verify your Kevalon ERP email address';
  const text = `Please verify your email address by clicking the link below (valid for 24 hours):\n\n${verifyLink}`;
  const html = `<p>Welcome to Kevalon ERP!</p><p>Please verify your email address by clicking the link below (valid for 24 hours):</p><p><a href="${verifyLink}">${verifyLink}</a></p>`;
  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Send an invite link to a newly invited user (Module 16).
 * Reuses Module 1's reset-password endpoint as the completion step — no new endpoint needed.
 * @param {string} toEmail
 * @param {string} plainToken - the raw (unhashed) invite token
 * @param {string} inviterCompanyName - name of the company the user is being invited to
 */
const sendInviteEmail = async (toEmail, plainToken, inviterCompanyName) => {
  const inviteLink = `${env.CLIENT_URL}/set-password?token=${plainToken}`;
  const subject = `You've been invited to join ${inviterCompanyName} on Kevalon ERP`;
  const text = `You have been invited to join ${inviterCompanyName} on Kevalon ERP.\n\nPlease click the link below to set your password and activate your account (valid for 48 hours):\n\n${inviteLink}\n\nIf you did not expect this invite, you can safely ignore this email.`;
  const html = `<p>You have been invited to join <strong>${inviterCompanyName}</strong> on Kevalon ERP.</p><p>Please click the link below to set your password and activate your account (valid for 48 hours):</p><p><a href="${inviteLink}">${inviteLink}</a></p><p><em>If you did not expect this invite, you can safely ignore this email.</em></p>`;
  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTemporaryPasswordEmail = async (toEmail, temporaryPassword, inviterCompanyName) => {
  const subject = 'Welcome to Kevalon Finance';
  const text = `Hello,\n\nYou have been registered on Kevalon Finance for ${inviterCompanyName}.\n\nEmail: ${toEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease log in and change your password immediately.\n\n${env.CLIENT_URL}`;
  const html = `<p>Hello,</p><p>You have been registered on <strong>Kevalon Finance</strong> for <strong>${inviterCompanyName}</strong>.</p><p><strong>Email:</strong> ${toEmail}<br/><strong>Temporary Password:</strong> ${temporaryPassword}</p><p>Please log in and change your password immediately.</p><p>If you did not expect this email, please contact your administrator.</p>`;
  return sendEmail({ to: toEmail, subject, text, html });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendInviteEmail,
  sendTemporaryPasswordEmail
};
