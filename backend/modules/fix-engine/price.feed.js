/**
 * Price feed
 * Subscribe to LP quotes, broadcast to risk/UI
 */
const logger = require('../../utils/logger');

let subscribers = [];

function subscribe(callback) {
  subscribers.push(callback);
  return () => { subscribers = subscribers.filter(cb => cb !== callback); };
}

function onTick(symbol, bid, ask) {
  subscribers.forEach(cb => cb({ symbol, bid, ask }));
}

module.exports = { subscribe, onTick };
