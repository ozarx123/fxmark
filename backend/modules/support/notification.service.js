/**
 * Notification service
 * Multi-channel: in-app, email (Gmail SMTP), WhatsApp, Telegram
 */
import whatsapp from './whatsapp.integration.js';
import telegram from './telegram.integration.js';
import emailService from '../email/email.service.js';
import userRepo from '../users/user.repository.js';

/**
 * Send notification to a user by channel.
 * @param {string} userId - User ID (for email/telegram/whatsapp we resolve contact)
 * @param {string} channel - 'email' | 'whatsapp' | 'telegram'
 * @param {string} subject - Subject (email) or title
 * @param {string} body - Message body
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
async function notify(userId, channel, subject, body) {
  if (channel === 'email') {
    const user = await userRepo.findById(userId);
    const email = user?.email;
    if (!email) return { sent: false, error: 'User or email not found' };
    const result = await emailService.sendMail({
      to: email,
      subject: subject || 'Notification',
      text: body,
      html: (body || '').replace(/\n/g, '<br>'),
    });
    return { sent: result.sent, error: result.error };
  }
  if (channel === 'whatsapp') return whatsapp.send(null, body);
  if (channel === 'telegram') return telegram.send(null, body);
  return { sent: false };
}

/**
 * Send email directly to an address (e.g. for system notifications).
 */
async function sendEmail(to, subject, body) {
  const result = await emailService.sendMail({
    to,
    subject: subject || 'Notification',
    text: body,
    html: (body || '').replace(/\n/g, '<br>'),
  });
  return { sent: result.sent, error: result.error };
}

export default { notify, sendEmail };
