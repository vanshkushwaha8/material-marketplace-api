const configenv = require('../config/env.config');

/**
 * OPL-345 AC2 — sent when an admin suspends an investor's account.
 * Deliberately generic about WHY — the admin's internal reason
 * (user.suspension.reason) is a compliance record for admin/audit eyes
 * only (see investorManagement.service.js's own comment on this), never
 * surfaced to the suspended investor themselves.
 *
 * Same convention as projectStatusChange.template.js: a plain async
 * function taking a data object, returning one inline-styled HTML string.
 * No external CSS/images — this has to render correctly in every email
 * client, most of which strip <style> blocks or ignore anything not
 * inlined.
 */
const investorSuspendedTemplate = async (data = {}) => {
  const { fullName } = data;
  const greetingName = fullName ? fullName.split(' ')[0] : 'there';

  // SUPPORT_EMAIL is a real, existing env value (env.config.js) that
  // nothing in the codebase had actually used until now — without it,
  // "contact support" in the old inline string had no way to actually
  // contact anyone. Degrades to plain text (no dead mailto: link) if it's
  // not configured, rather than assuming it always is.
  const supportContact = configenv.SUPPORT_EMAIL
    ? `<a href="mailto:${configenv.SUPPORT_EMAIL}" style="color:#2563EB;text-decoration:none;">${configenv.SUPPORT_EMAIL}</a>`
    : 'our support team';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Opalus – Account Suspended</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Georgia,'Times New Roman',serif;color:#0D1B2A;">
  <div style="max-width:620px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #C8D6E8;">
    <div style="background:#0D1B42;padding:28px 40px;text-align:center;">
      <span style="color:#ffffff;font-size:20px;letter-spacing:1px;">Opalus</span>
    </div>
    <div style="padding:32px 40px;">
      <h2 style="margin:0 0 16px;font-size:20px;">Your account has been suspended</h2>
      <p style="margin:0 0 12px;">Hi ${greetingName},</p>
      <p style="margin:0 0 12px;">
        Your Opalus account has been temporarily suspended, and you will not be
        able to sign in while this is in effect.
      </p>
      <p style="margin:0 0 12px;">
        Please contact ${supportContact} for more information about your account
        and what's needed to resolve this.
      </p>
      <p style="margin:24px 0 0;font-size:13px;color:#4A5568;">
        This is an automated notice — please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { investorSuspendedTemplate };
