/**
 * screenParty(payload)
 *   payload: { name, dateOfBirth, nationality, country, entityType: 'individual'|'company' }
 *   returns: { hit: boolean, matchScore: number|null, matchedList: string|null, referenceId: string|null, requiresManualReview: boolean }
 */
class SanctionsAdapterInterface {
  async screenParty(_payload) {
    throw new Error('screenParty() not implemented');
  }
}

module.exports = SanctionsAdapterInterface;
