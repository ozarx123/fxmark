/**
 * User service
 * Find, create, update users
 */
async function getById(id) {
  // TODO: load from DB
  return { id, email: '', role: '', kycStatus: '' };
}

async function update(id, payload) {
  // TODO: validate and update allowed fields
  return getById(id);
}

async function findByEmail(email) {
  // TODO: load from DB
  return null;
}

module.exports = { getById, update, findByEmail };
