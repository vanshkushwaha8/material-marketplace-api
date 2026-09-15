/**
 * OPL-345 AC4 — "investor-list export (CSV) ... available where appropriate,
 * audit-logged." Same escaping convention as auditLogExport.util.js's
 * toCSV, kept as its own small function here rather than importing that
 * one — its EXPORT_COLUMNS list is audit-log-specific, not reusable for a
 * different row shape.
 */
const EXPORT_COLUMNS = [
  { key: 'id', label: 'Investor ID' },
  { key: 'fullName', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'country', label: 'Country' },
  { key: 'category', label: 'Category' },
  { key: 'kycStatus', label: 'KYC Status' },
  { key: 'portfolioValue', label: 'Portfolio Value' },
  { key: 'walletBalance', label: 'Wallet Balance' },
  { key: 'currency', label: 'Currency' },
  { key: 'accountStatus', label: 'Account Status' },
  { key: 'createdAt', label: 'Registered On' },
];

const csvEscape = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toInvestorCSV = (rows) => {
  const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) => EXPORT_COLUMNS.map((c) => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
};

module.exports = { EXPORT_COLUMNS, toInvestorCSV };
