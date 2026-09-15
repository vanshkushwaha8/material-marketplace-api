const SanctionsAdapterInterface = require('./sanctions.interface');

/**
 * Used when SANCTIONS_ENABLED=false. Never returns a real hit — it
 * always defers to a human, which is the honest thing to do without a
 * real screening provider: this system has no actual sanctions list data
 * to check against, so claiming hit:false outright (rather than
 * requiresManualReview:true) would be presenting "we didn't check" as
 * "we checked and it's clear," which is false and dangerous for an AML
 * control. amlMonitoring.service.js reads requiresManualReview:true and
 * generates a SANCTIONS_MANUAL_REVIEW alert instead of SANCTIONS_HIT,
 * routing it to a compliance officer's queue for a real manual check
 * against OFAC/EU/UN lists.
 */
class ManualSanctionsAdapter extends SanctionsAdapterInterface {
  async screenParty(_payload) {
    return {
      hit: false,
      matchScore: null,
      matchedList: null,
      referenceId: null,
      requiresManualReview: true,
    };
  }
}

module.exports = ManualSanctionsAdapter;
