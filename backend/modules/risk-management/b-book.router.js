/**
 * B-Book router
 * Internal matching, house risk; AI risk switch can redirect
 */
async function route(order) {
  // TODO: internal fill or hedge via hedging.service
  return { routed: true, lp: 'b-book' };
}

module.exports = { route };
