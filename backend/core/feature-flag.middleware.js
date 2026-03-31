import featureFlagsService from '../modules/feature-flags/feature-flags.service.js';

export function requireFeatureFlag(flagId, options = {}) {
  const { defaultValue = false, envVar = '', message = 'Feature is not enabled.' } = options;
  return async function featureFlagGuard(req, res, next) {
    try {
      const enabled = await featureFlagsService.isFeatureEnabled(flagId, { defaultValue, envVar });
      if (enabled) return next();
      return res.status(404).json({ error: message, feature: flagId });
    } catch (error) {
      return next(error);
    }
  };
}

export default {
  requireFeatureFlag,
};
