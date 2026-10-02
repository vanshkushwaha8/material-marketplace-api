const BRAND = require('../config/brand.config');
const { renderEmail, button, paragraph, note, escapeHtml } = require('./emailLayout');

// Account emails that used to be inline, unbranded HTML strings
// (password reset, password changed, 2FA code).

const passwordResetEmail = ({ resetUrl, validFor = '24 hours' }) => renderEmail({
  title: 'Reset your password',
  preheader: `Reset the password for your ${BRAND.NAME} account.`,
  body: [
    paragraph(`We received a request to reset the password for your ${escapeHtml(BRAND.NAME)} account.`),
    button(resetUrl, 'Reset password'),
    note(`This link is valid for <strong>${escapeHtml(validFor)}</strong> and can be used once.`),
    note(`Button not working? Copy this link into your browser:<br /><a href="${escapeHtml(resetUrl)}" style="color:${BRAND.COLORS.navy};word-break:break-all;">${escapeHtml(resetUrl)}</a>`),
  ].join(''),
  reason: "If you didn't ask to reset your password, ignore this email — your password stays the same.",
});

const passwordChangedEmail = ({ name }) => renderEmail({
  title: 'Your password was changed',
  preheader: `The password for your ${BRAND.NAME} account was changed.`,
  body: [
    paragraph(`Hi <strong>${escapeHtml(name || 'there')}</strong>,`),
    paragraph('Your password was just changed, and every device signed in to your account was signed out.'),
    paragraph("If this wasn't you, reset your password immediately using “Forgot password” on the sign-in page."),
  ].join(''),
  reason: `Security notice for your ${BRAND.NAME} account.`,
});

const verificationCodeEmail = ({ otp }) => renderEmail({
  title: 'Your verification code',
  preheader: `Your ${BRAND.NAME} verification code. It expires in 10 minutes.`,
  body: [
    paragraph('Use this code to finish verifying. It expires in <strong>10 minutes</strong>. Never share it with anyone — our team will never ask for it.'),
    `<p style="margin:22px 0;text-align:center;"><span style="display:inline-block;padding:14px 26px;border-radius:10px;background:#F2F5F8;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:${BRAND.COLORS.navy};">${escapeHtml(otp)}</span></p>`,
  ].join(''),
  reason: "If you didn't request this code, you can ignore this email.",
});

module.exports = { passwordResetEmail, passwordChangedEmail, verificationCodeEmail };
