/**
 * Notification service
 * Multi-channel: in-app, email, WhatsApp, Telegram
 */
const whatsapp = require('./whatsapp.integration');
const telegram = require('./telegram.integration');

async function notify(userId, channel, subject, body) {
  // TODO: resolve user contact, route by channel
  if (channel === 'whatsapp') return whatsapp.send(null, body);
  if (channel === 'telegram') return telegram.send(null, body);
  return { sent: false };
}

module.exports = { notify };
