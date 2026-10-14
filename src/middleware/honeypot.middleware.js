// Bot trap for the public (signed-out) account forms. The frontend renders a
// visually hidden, aria-hidden, tab-skipped "company website" input that a
// person never sees or fills; form-filling bots fill every field. A filled
// trap gets the same generic 400 a real validation failure would, so the bot
// learns nothing. The field is always removed before Joi validation runs
// (the schemas reject unknown keys).
//
// Works alongside — not instead of — the per-route rate limits and the
// email-verification step on new accounts.
const HONEYPOT_FIELD = 'company_website';

const honeypot = (req, res, next) => {
  const value = req.body?.[HONEYPOT_FIELD];
  if (req.body && HONEYPOT_FIELD in req.body) delete req.body[HONEYPOT_FIELD];
  if (typeof value === 'string' && value.trim() !== '') {
    return res.status(400).json({ status: false, message: 'Your request could not be processed. Please try again.' });
  }
  return next();
};

module.exports = { honeypot, HONEYPOT_FIELD };
