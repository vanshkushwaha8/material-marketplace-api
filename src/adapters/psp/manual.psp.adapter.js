const PspAdapterInterface = require('./psp.interface');

/**
 * Used when PSP_ENABLED=false (the default until a vendor is contracted —
 * see integrations.config.js). This is not a mock or a stub to delete
 * later — it's the actual manual-execution workflow ops uses today:
 * approving a release here doesn't move real money by itself, it puts
 * the release into a "pending manual payment" state that the ops team
 * then executes directly in the PSP's own dashboard, and confirms back
 * here via the mark-executed endpoint (see moneyOps routes).
 *
 * Note on the implementation blueprint's own inconsistency: one section
 * describes this adapter as writing a separate "PendingManualPayment"
 * record; another explicitly says no new model is needed, just a filter
 * on `pspStatus: 'pending_manual'` against the withdrawal/escrow
 * documents that already exist. Built to the simpler version — avoids a
 * sixth schema for something the existing documents already capture, and
 * keeps this adapter a pure request/response boundary rather than one
 * that reaches into a different collection than whatever called it.
 */
class ManualPspAdapter extends PspAdapterInterface {
  async executeWithdrawal(payload) {
    return {
      success: true,
      providerRef: null,
      status: 'pending_manual',
      raw: { adapter: 'manual', payload },
    };
  }

  async executeEscrowRelease(payload) {
    return {
      success: true,
      providerRef: null,
      status: 'pending_manual',
      raw: { adapter: 'manual', payload },
    };
  }

  async getStatement(_date) {
    // Empty statement — reconMatch.job.js reads this as "nothing to match
    // against automatically," and surfaces the day's run for a manual CSV
    // upload instead of silently producing zero exceptions (which would
    // look identical to "everything reconciled perfectly," a dangerous
    // false signal for a financial-controls job).
    return { transactions: [] };
  }
}

module.exports = ManualPspAdapter;
