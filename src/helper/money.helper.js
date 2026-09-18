// All monetary math happens in integer paise (1 INR = 100 paise) to avoid
// floating-point drift on financial calculations — spec's "proper
// decimal/money handling, avoid unsafe floating point" requirement.
// Rupee-facing schema fields still store plain rupee numbers; this helper
// is the only place that crosses between the two representations.
function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}
function fromPaise(paise) {
  return Math.round(paise) / 100;
}
function calculateCommissionPaise(grossAmountPaise, commissionPct) {
  const commissionAmountPaise = Math.round(grossAmountPaise * (Number(commissionPct) / 100));
  const sellerSettlementPaise = grossAmountPaise - commissionAmountPaise;
  return { commissionAmountPaise, sellerSettlementPaise };
}
module.exports = { toPaise, fromPaise, calculateCommissionPaise };