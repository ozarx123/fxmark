/**
 * Admin controller
 * Leads, tickets, KYC override, PAMM privacy, broadcast
 */
async function getLeads(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

async function kycOverride(req, res, next) {
  try {
    res.json({ status: 'updated' });
  } catch (e) {
    next(e);
  }
}

async function pammPrivacy(req, res, next) {
  try {
    res.json({ status: 'updated' });
  } catch (e) {
    next(e);
  }
}

async function broadcast(req, res, next) {
  try {
    res.status(202).json({ campaignId: '', status: 'queued' });
  } catch (e) {
    next(e);
  }
}

module.exports = { getLeads, kycOverride, pammPrivacy, broadcast };
