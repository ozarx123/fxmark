/**
 * FIX protocol / FIX engine configuration
 * Sessions, LP connectors, credentials
 */
module.exports = {
  senderCompID: process.env.FIX_SENDER_COMP_ID || 'FXMARK',
  targetCompID: process.env.FIX_TARGET_COMP_ID || 'LP',
  host: process.env.FIX_HOST || 'localhost',
  port: parseInt(process.env.FIX_PORT || '9876', 10),
  heartbeatInterval: 30,
  logonTimeout: 10,
  credentials: {
    username: process.env.FIX_USERNAME,
    password: process.env.FIX_PASSWORD,
  },
};
