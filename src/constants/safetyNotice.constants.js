// Version of the buyer / seller fraud-awareness notice (the wording lives in
// the web app: components/safety/safetyContent.js). Bump a role's version
// ONLY when its guidance materially changes — every user of that role is
// then shown the notice once more after their next login. Dismissing or
// acknowledging records the version on the user (user.safetyNoticeAcks), so
// the notice follows the account across devices instead of a browser flag.
const SAFETY_NOTICE_VERSIONS = Object.freeze({
  buyer: '2026-10-01',
  seller: '2026-10-01',
});

const SAFETY_NOTICE_ACTIONS = Object.freeze({ ACKNOWLEDGED: 'ACKNOWLEDGED', DISMISSED: 'DISMISSED' });

module.exports = { SAFETY_NOTICE_VERSIONS, SAFETY_NOTICE_ACTIONS };
