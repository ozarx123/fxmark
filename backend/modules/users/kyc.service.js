/**
 * KYC service (Sumsub integration)
 * Applicant, token, status
 */
async function createApplicant(userId, payload) {
  // TODO: call Sumsub API, store applicantId
  return { applicantId: '' };
}

async function getAccessToken(userId) {
  // TODO: Sumsub SDK token for client
  return { token: '' };
}

async function getStatus(userId) {
  // TODO: Sumsub webhook or API status
  return { status: 'pending' };
}

module.exports = { createApplicant, getAccessToken, getStatus };
