import userService from './user.service.js';

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

export default { getProfile, updateProfile };
