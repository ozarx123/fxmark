/**
 * Email service — Zoho Mail SMTP via Nodemailer.
 * Used for verification emails, notifications, password resets, etc.
 */
import nodemailer from 'nodemailer';
import config from '../../config/env.config.js';

let transporter = null;
let warnedFromMismatch = false;

function warnFromAlignmentOnce() {
  if (warnedFromMismatch) return;
  const from = (config.fromEmail || '').trim().toLowerCase();
  const auth = (config.zohoMailUser || '').trim().toLowerCase();
  if (from && auth && from !== auth) {
    warnedFromMismatch = true;
    console.warn(
      '[email] FROM_EMAIL differs from ZOHO_MAIL_USER — use the same address or a Zoho-authorized alias, or mail may land in spam (SPF/DKIM alignment).'
    );
  }
}

function getSmtpOptions() {
  const user = (config.zohoMailUser || (process.env.ZOHO_MAIL_USER || '').trim().toLowerCase()) || '';
  const pass =
    (config.zohoMailPassword || (process.env.ZOHO_MAIL_PASSWORD || '').replace(/\s+/g, '').trim()) || '';
  const host = (config.zohoSmtpHost || 'smtp.zoho.com').trim();
  const port = Number.isFinite(config.zohoSmtpPort) && config.zohoSmtpPort > 0 ? config.zohoSmtpPort : 465;
  const secure = port === 465;
  return {
    host,
    port,
    secure,
    auth: { user, pass },
    ...(port === 587 && { requireTLS: true }),
  };
}

function getTransporter() {
  if (transporter) return transporter;
  const opts = getSmtpOptions();
  if (!opts.auth.user || !opts.auth.pass) {
    console.warn(
      '[email] Zoho Mail not configured: set ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD (see .env.example).'
    );
    return null;
  }
  transporter = nodemailer.createTransport(opts);
  return transporter;
}

/**
 * Send an email. Returns { sent: true } or { sent: false, error }.
 * @param {{ to: string, subject: string, text?: string, html?: string, replyTo?: string }}
 */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const trans = getTransporter();
  if (!trans) return { sent: false, error: 'Email not configured' };
  warnFromAlignmentOnce();
  const from = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
  try {
    await trans.sendMail({
      from,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
      replyTo: replyTo || undefined,
      headers: {
        // Helps some filters treat mail as normal transactional (avoid looking like blank bulk)
        'X-Mailer': 'FXMARK',
      },
    });
    return { sent: true };
  } catch (e) {
    console.warn('[email] send failed:', e.message);
    return { sent: false, error: e.message };
  }
}

/**
 * Send a simple text notification to an email address.
 */
export async function sendNotification(to, subject, body) {
  return sendMail({ to, subject, text: body, html: body.replace(/\n/g, '<br>') });
}

export default { sendMail, sendNotification, getTransporter };
