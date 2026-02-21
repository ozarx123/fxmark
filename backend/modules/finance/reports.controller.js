/**
 * Finance reports controller
 * Daily/monthly statements, exports
 */
async function dailyReport(req, res, next) {
  try {
    res.json({ period: 'daily', data: [] });
  } catch (e) {
    next(e);
  }
}

async function monthlyReport(req, res, next) {
  try {
    res.json({ period: 'monthly', data: [] });
  } catch (e) {
    next(e);
  }
}

module.exports = { dailyReport, monthlyReport };
