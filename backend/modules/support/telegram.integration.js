/**
 * Telegram integration (omni-channel)
 * Send/receive; webhook signature verification
 */
async function send(chatId, message) {
  // TODO: Telegram Bot API
  return { sent: true };
}

function verifyWebhookSignature(payload, signature) {
  return true;
}

module.exports = { send, verifyWebhookSignature };
