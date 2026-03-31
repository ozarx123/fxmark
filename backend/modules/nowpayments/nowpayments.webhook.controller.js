/**
 * POST /api/webhooks/nowpayments — IPN (no auth; signature required).
 */
import { verifyNowpaymentsIpnSignature } from './nowpayments.signature.js';
import * as npService from './nowpayments.service.js';

function parseIpAllowList() {
  const raw = (process.env.NOWPAYMENTS_IP_ALLOWLIST || '').trim();
  if (!raw) return [];
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function requestIp(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').trim();
}

export default async function handleNowpaymentsWebhook(req, res) {
  const remoteIp = requestIp(req);
  const allowList = parseIpAllowList();
  if (allowList.length > 0 && !allowList.includes(remoteIp)) {
    console.warn('[nowpayments][security] suspicious_webhook_ip', {
      event: 'webhook_rejected_ip_not_allowed',
      ip: remoteIp,
      timestamp: new Date().toISOString(),
    });
    return res.status(403).json({ error: 'Forbidden' });
  }

  const secret = (process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
  if (!secret) {
    console.error('[nowpayments] IPN secret not configured');
    return res.status(503).json({ error: 'IPN not configured' });
  }

  const headerSig = (req.get('x-nowpayments-sig') || '').trim();
  if (!headerSig) {
    console.warn('[nowpayments][security] missing_signature_header', {
      event: 'webhook_rejected_missing_signature',
      ip: remoteIp,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({ error: 'Missing signature header' });
  }

  const ok = verifyNowpaymentsIpnSignature({
    body: req.body,
    rawBody: req.rawNowpaymentsBody,
    secret,
    headerSig,
  });
  if (!ok) {
    console.warn('[nowpayments][security] invalid_signature', {
      event: 'webhook_rejected_invalid_signature',
      ip: remoteIp,
      order_id: req.body?.order_id ?? null,
      payment_id: req.body?.payment_id ?? null,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('[nowpayments][event]', {
    event: 'signature_verification_pass',
    order_id: req.body?.order_id ?? null,
    payment_id: req.body?.payment_id ?? null,
    payment_status: req.body?.payment_status ?? null,
    timestamp: new Date().toISOString(),
  });

  try {
    await npService.handleNowpaymentsIpn(req.body || {}, { ip: remoteIp });
    return res.status(200).type('text/plain').send('ok');
  } catch (e) {
    console.error('[nowpayments] IPN handler error', e?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
