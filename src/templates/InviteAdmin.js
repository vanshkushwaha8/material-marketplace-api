const BRAND = require('../config/brand.config');
const { renderEmail, button, detailsTable, paragraph, note, escapeHtml } = require('./emailLayout');

// Staff invitation to the admin console (sub-admin created by the Super
// Admin). `roleName` is the staff role the account was given.
const inviteSubadmin = ({ name, email, roleName, inviteUrl, validFor = '24 hours' }) => renderEmail({
  title: "You're invited to the admin console",
  preheader: `Set your password to join the ${BRAND.NAME} admin console${roleName ? ` as ${roleName}` : ''}.`,
  body: [
    paragraph(`Hello <strong>${escapeHtml(name || 'there')}</strong>,`),
    paragraph(`The ${escapeHtml(BRAND.NAME)} Super Admin has invited you to the <strong>${escapeHtml(BRAND.NAME)} admin console</strong>. Your access is set by your role.`),
    detailsTable([['Name', name || '—'], ['Email', email || '—'], ['Role', roleName || '—']]),
    paragraph(`Set your password to activate your account. The link expires in <strong>${escapeHtml(validFor)}</strong> and works once — after that, use <strong>Forgot password?</strong> on the admin login page to change it.`),
    button(inviteUrl, 'Set my password'),
    note(`After setting your password, ${BRAND.ADMIN_LOGIN_URL ? `sign in at <a href="${escapeHtml(BRAND.ADMIN_LOGIN_URL)}" style="color:${BRAND.COLORS.navy};">${escapeHtml(BRAND.ADMIN_LOGIN_URL.replace(/^https?:\/\//, ''))}</a>` : 'sign in to the admin console'}. We recommend turning on two-factor authentication.`),
    note(`Button not working? Copy this link into your browser:<br /><a href="${escapeHtml(inviteUrl)}" style="color:${BRAND.COLORS.navy};word-break:break-all;">${escapeHtml(inviteUrl)}</a>`),
  ].join(''),
  reason: `You received this because a ${BRAND.NAME} administrator invited ${email || 'you'}. If you weren't expecting it, ignore this email.`,
});

module.exports = inviteSubadmin;
