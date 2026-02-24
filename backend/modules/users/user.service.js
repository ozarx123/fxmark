import userRepo from './user.repository.js';

async function getById(id) {
  const user = await userRepo.findById(id);
  if (!user) return null;
  return userRepo.ensureAccountNo(id);
}

async function findByEmail(email) {
  return userRepo.findByEmail(email);
}

async function update(id, payload) {
  const allowed = ['email', 'role', 'kycStatus', 'name', 'phone', 'country', 'city', 'address', 'avatar', 'profileComplete'];
  const update = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) update[k] = payload[k];
  }
  if (payload.email) update.email = payload.email.toLowerCase().trim();
  if (Object.keys(update).length === 0) return getById(id);
  return userRepo.updateById(id, update);
}

export default { getById, update, findByEmail };
