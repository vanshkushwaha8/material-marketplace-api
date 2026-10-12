// Human-readable order number shown in notifications and on order pages:
// the last 8 hex characters of the transaction id, upper-cased. Derived,
// never stored — the frontend (utils/orderRef.js) uses the same rule so a
// notification's "#1A2B3C4D" matches what the order page shows.
function orderRef(id) {
  const s = String(id || '');
  return s ? `#${s.slice(-8).toUpperCase()}` : '';
}

module.exports = { orderRef };
