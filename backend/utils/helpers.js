/**
 * General helpers
 * Dates, numbers, IDs
 */
const toDecimal = (n, places = 2) => Number(Number(n).toFixed(places));

const formatDate = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

module.exports = { toDecimal, formatDate };
