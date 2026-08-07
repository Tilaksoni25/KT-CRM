const nodemailer = require('nodemailer');
const env = require('../config/env');
const pino = require('pino');
const {
  buildInviteEmailContent,
  buildTemporaryPasswordEmailContent
} = require('./email.templates');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

let transporter = null;
const isEmailJsConfigured = Boolean(
  env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY
);

// Initialize Nodemailer transporter if SMTP config is present
if (!isEmailJsConfigured && env.SMTP_HOST && env.SMTP_USER) {
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
 * Send an email through EmailJS's REST API. The private key stays on the
 * server; it must never be exposed to browser code.
 */
const sendWithEmailJs = async ({ to, subject, text, html, templateParams = {} }) => {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      ...(env.EMAILJS_PRIVATE_KEY ? { accessToken: env.EMAILJS_PRIVATE_KEY } : {}),
      template_params: {
        to_email: to,
        email: to,
        subject,
        message: text,
        html_content: html,
        ...templateParams
      }
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`EmailJS request failed (${response.status}): ${responseText}`);
  }

  logger.info(`Email sent successfully through EmailJS to ${to}`);
  return { messageId: responseText || 'emailjs-sent', provider: 'emailjs' };
};

/**
 * Send an email using EmailJS, Nodemailer, or log it if neither is configured.
 * @param {object} options - { to, subject, text, html, templateParams }
 * @returns {Promise<object>}
 */
const sendEmail = async ({ to, subject, text, html, templateParams }) => {
  if (isEmailJsConfigured) {
    try {
      return await sendWithEmailJs({ to, subject, text, html, templateParams });
    } catch (error) {
      logger.error(`EmailJS failed to send email to ${to}: ${error.message}`);
      if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
        return { messageId: 'emailjs-fallback-id', preview: true, error: error.message };
      }
      throw error;
    }
  }

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
  const { subject, text, html } = buildInviteEmailContent('Kevalon ERP', verifyLink);
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
  const { subject, text, html } = buildInviteEmailContent(inviterCompanyName, inviteLink);
  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTemporaryPasswordEmail = async (toEmail, temporaryPassword, inviterCompanyName) => {
  const loginUrl = env.CLIENT_URL;
  const { subject, text, html } = buildTemporaryPasswordEmailContent(
    inviterCompanyName,
    toEmail,
    temporaryPassword,
    loginUrl
  );
  return sendEmail({ to: toEmail, subject, text, html });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendInviteEmail,
  sendTemporaryPasswordEmail
};
