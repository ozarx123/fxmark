/**
 * PAMM controller
 * Managers list, follow, unfollow, withdraw, trades
 */
async function listManagers(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

async function follow(req, res, next) {
  try {
    res.status(201).json({ allocationId: '', status: 'active' });
  } catch (e) {
    next(e);
  }
}

async function unfollow(req, res, next) {
  try {
    res.json({ status: 'closed' });
  } catch (e) {
    next(e);
  }
}

async function withdraw(req, res, next) {
  try {
    res.json({ requestId: '', status: 'pending' });
  } catch (e) {
    next(e);
  }
}

async function getTrades(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

module.exports = { listManagers, follow, unfollow, withdraw, getTrades };
