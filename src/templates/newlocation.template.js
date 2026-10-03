const BRAND = require('../config/brand.config');
const { renderEmail, detailsTable, paragraph, note, escapeHtml } = require('./emailLayout');

// Security notice: the account was used from a new IP address.
const newLoginLocationTemplate = async ({ name, ipAddress, time } = {}) => renderEmail({
  title: 'New sign-in to your account',
  preheader: `Your ${BRAND.NAME} account was used from a new location.`,
  body: [
    paragraph(`Hi <strong>${escapeHtml(name || 'there')}</strong>, your ${escapeHtml(BRAND.NAME)} account was just used from a new location.`),
    detailsTable([['IP address', String(ipAddress || 'Unknown').replace('::ffff:', '')], ['Time', time || new Date().toLocaleString('en-IN')]]),
    paragraph("If this was you, there's nothing to do."),
    paragraph(`If it wasn't, change your password now and sign out other devices from <strong>Account settings → Active sessions</strong>.`),
    BRAND.SITE_URL ? note(`<a href="${escapeHtml(BRAND.SITE_URL)}" style="color:${BRAND.COLORS.navy};">Open ${escapeHtml(BRAND.NAME)}</a>`) : '',
  ].join(''),
  reason: `Security notice for your ${BRAND.NAME} account.`,
});

module.exports = { newLoginLocationTemplate };
