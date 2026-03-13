import userService from './user.service.js';
import userRepo from './user.repository.js';

async function getProfile(req, res, next) {
  try {
    const profile = await userService.getById(req.user?.id);
    res.json(profile);
  } catch (e) {
    next(e);
  }
}

async function updateProfile(req, res, next) {
  try {
    const updated = await userService.update(req.user?.id, req.body);
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

/** GET /users/kyc — return current user KYC status (also available on profile) */
async function getKyc(req, res, next) {
  try {
    const profile = await userService.getById(req.user?.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json({
      kycStatus: profile.kycStatus || 'pending',
      kycSubmittedAt: profile.kycSubmittedAt || null,
      kycRejectedReason: profile.kycRejectedReason || null,
    });
  } catch (e) {
    next(e);
  }
}

/** POST /users/kyc/submit — mark KYC as submitted for review (resets rejection so user can resubmit) */
async function submitKyc(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await userRepo.updateById(userId, {
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
      kycRejectedReason: '', // clear previous rejection reason on resubmit
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      kycStatus: user.kycStatus || 'pending',
      kycSubmittedAt: user.kycSubmittedAt,
      message: 'KYC submitted for review',
    });
  } catch (e) {
    next(e);
  }
}

export default { getProfile, updateProfile, getKyc, submitKyc };
