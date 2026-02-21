/**
 * Support tickets controller
 * Create, list, reply (omni-channel)
 */
async function create(req, res, next) {
  try {
    res.status(201).json({ ticketId: '', status: 'open' });
  } catch (e) {
    next(e);
  }
}

async function list(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

async function reply(req, res, next) {
  try {
    res.json({ messageId: '' });
  } catch (e) {
    next(e);
  }
}

module.exports = { create, list, reply };
