/**
 * The contract every PSP adapter must implement — withdrawal.service.js
 * and escrowRelease.service.js only ever call through
 * integrations.config.js#getPspAdapter(), never a concrete adapter
 * directly. This file documents the shape; it's not itself instantiated.
 *
 * executeWithdrawal(payload)
 *   payload: { investorId, amountMinorUnits, currency, destinationAccountId, referenceId }
 *   returns: { success: boolean, providerRef: string|null, status: 'executed'|'pending_manual', raw: any }
 *
 * executeEscrowRelease(payload)
 *   payload: { projectId, milestoneId, amountMinorUnits, currency, issuerAccountId, referenceId }
 *   returns: { success: boolean, providerRef: string|null, status: 'executed'|'pending_manual', raw: any }
 *
 * getStatement(date)
 *   payload: { date: 'YYYY-MM-DD' }
 *   returns: { transactions: [ { ref, type, amountMinorUnits, currency, timestamp } ] }
 */
class PspAdapterInterface {
  async executeWithdrawal(_payload) {
    throw new Error('executeWithdrawal() not implemented');
  }

  async executeEscrowRelease(_payload) {
    throw new Error('executeEscrowRelease() not implemented');
  }

  async getStatement(_date) {
    throw new Error('getStatement() not implemented');
  }
}

module.exports = PspAdapterInterface;
