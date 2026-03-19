/**
 * Email service — Gmail SMTP via Nodemailer (App Password).
 * Used for verification emails and notification emails.
 */
import nodemailer from 'nodemailer';
import config from '../../config/env.config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user =
    (config.gmailUser || (process.env.GMAIL_USER || '').trim().toLowerCase()) || '';
  const pass =
    (config.gmailAppPassword || (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim()) ||
    '';
  if (!user || !pass) {
    console.warn(
      '[email] Gmail not configured: set GMAIL_USER and GMAIL_APP_PASSWORD (see .env.example).'
    );
    return null;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Send an email. Returns { sent: true } or { sent: false, error }.
 * @param {{ to: string, subject: string, text?: string, html?: string, replyTo?: string }}
 */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const trans = getTransporter();
  if (!trans) return { sent: false, error: 'Email not configured' };
  const from = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
  try {
    await trans.sendMail({
      from,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
      replyTo: replyTo || undefined,
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
