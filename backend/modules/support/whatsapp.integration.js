/**
 * WhatsApp integration (omni-channel)
 * Send/receive messages; webhook signature verification
 */
async function send(to, message) {
  // TODO: WhatsApp Business API
  return { sent: true };
}

function verifyWebhookSignature(payload, signature) {
  // TODO: verify signature from provider
  return true;
}

module.exports = { send, verifyWebhookSignature };
