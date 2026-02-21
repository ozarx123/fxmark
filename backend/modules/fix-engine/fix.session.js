/**
 * FIX session management
 * Connect, logon, heartbeat, logout
 */
const config = require('../../config/fix.config');

let sessionState = 'disconnected';

function connect() {
  // TODO: create FIX session (e.g. quickfix or custom), logon
  sessionState = 'connected';
}

function disconnect() {
  sessionState = 'disconnected';
}

function getState() {
  return sessionState;
}

function send(message) {
  // TODO: encode and send FIX message
}

module.exports = { connect, disconnect, getState, send };
