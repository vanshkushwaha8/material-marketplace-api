const BRAND = require('../config/brand.config');
const { renderEmail, button, paragraph, note, escapeHtml } = require('./emailLayout');

// "Verify your email" — sent at registration and on resend.
const verifyTemplate = ({ verifyUrl } = {}) => renderEmail({
  title: 'Verify your email address',
  preheader: `Confirm your email to start buying and selling on ${BRAND.NAME}.`,
  body: [
    paragraph(`Welcome to ${escapeHtml(BRAND.NAME)}! Confirm your email address to activate your account.`),
    button(verifyUrl, 'Verify my email'),
    note('This link expires in 24 hours.'),
    note(`Button not working? Copy this link into your browser:<br /><a href="${escapeHtml(verifyUrl)}" style="color:${BRAND.COLORS.navy};word-break:break-all;">${escapeHtml(verifyUrl)}</a>`),
  ].join(''),
  reason: `You received this because this address was used to create a ${BRAND.NAME} account. If that wasn't you, ignore this email.`,
});

module.exports = verifyTemplate;
