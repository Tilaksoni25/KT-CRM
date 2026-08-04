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

module.exports = {
  sendEmail,
  sendVerificationEmail
};
