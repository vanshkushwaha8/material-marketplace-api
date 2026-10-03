const path = require('path');
const configenv = require('./env.config');

// The ONE place the platform's name and contact context live. Every email
// (templates, subjects, sender name, footer) and other user-facing backend
// text reads from here, so branding can't drift per template again.
const trimSlash = (url) => String(url || '').replace(/\/+$/, '');
const siteUrl = trimSlash(configenv.SITE_URL || configenv.FRONTEND_URL);

module.exports = Object.freeze({
  NAME: 'BUILD MATERIAL',
  TAGLINE: 'Buy and sell construction materials near you',
  SITE_URL: siteUrl,
  // Empty when FRONTEND_URL isn't configured — templates then omit the link.
  ADMIN_LOGIN_URL: configenv.FRONTEND_URL ? `${trimSlash(configenv.FRONTEND_URL)}/admin/login` : '',
  // Shipped with the backend and embedded in each email (cid:brand-logo),
  // so it shows even when the API host isn't publicly reachable.
  LOGO_FILE: path.join(__dirname, '..', 'assets', 'email', 'logo.png'),
  LOGO_CID: 'brand-logo',
  COLORS: Object.freeze({ navy: '#0F2742', orange: '#F47A1F', text: '#344054', muted: '#667085', border: '#E4E7EC', bg: '#F4F6F9' }),
});
