const BRAND = require('../config/brand.config');

// Shared shell for every email the platform sends: logo header, content,
// footer. Table-based + inline styles for email-client compatibility.
const C = BRAND.COLORS;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** A full-width call-to-action button. */
const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td style="border-radius:8px;background:${C.orange};">
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener"
         style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;

/** Label/value rows (e.g. invitation details). */
const detailsTable = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:20px 0;border:1px solid ${C.border};border-left:4px solid ${C.orange};border-radius:8px;background:#FAFBFC;">
    ${rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};width:38%;border-bottom:1px solid ${C.border};">${escapeHtml(label)}</td>
      <td style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.navy};font-weight:600;border-bottom:1px solid ${C.border};">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;

const paragraph = (html) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${C.text};">${html}</p>`;
const note = (html) => `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${C.muted};">${html}</p>`;

/**
 * @param {object} p
 * @param {string} p.title      document <title> and heading
 * @param {string} p.preheader  inbox preview text
 * @param {string} p.body       inner HTML (built with the helpers above)
 * @param {string} [p.reason]   one line explaining why the person got this email
 */
const renderEmail = ({ title, preheader = '', body, reason = '' }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} – ${escapeHtml(BRAND.NAME)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${C.border};">
        <tr><td align="center" style="padding:24px 24px 18px;border-bottom:4px solid ${C.orange};">
          ${(() => {
            const img = `<img src="cid:${BRAND.LOGO_CID}" width="220" height="48" alt="${escapeHtml(BRAND.NAME)}" style="display:block;border:0;width:220px;height:auto;" />`;
            return BRAND.SITE_URL ? `<a href="${escapeHtml(BRAND.SITE_URL)}" target="_blank" rel="noopener" style="text-decoration:none;">${img}</a>` : img;
          })()}
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${C.navy};">${escapeHtml(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.border};">
          ${reason ? `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">${escapeHtml(reason)}</p>` : ''}
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">
            ${escapeHtml(BRAND.NAME)} — ${escapeHtml(BRAND.TAGLINE)}<br />
            ${BRAND.SITE_URL ? `<a href="${escapeHtml(BRAND.SITE_URL)}" style="color:${C.muted};">${escapeHtml(BRAND.SITE_URL.replace(/^https?:\/\//, ''))}</a> · ` : ''}© ${new Date().getFullYear()} ${escapeHtml(BRAND.NAME)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

module.exports = { renderEmail, button, detailsTable, paragraph, note, escapeHtml };
