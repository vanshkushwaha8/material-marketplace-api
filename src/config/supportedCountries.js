/**
 * Countries accepted wherever `Country of Residence` is collected
 * (registration / profile). Backend mirror of frontend
 * src/config/supportedCountries.js#COUNTRY_OPTIONS — keep both in sync;
 * ISO 3166-1 alpha-2 codes.
 */
const COUNTRY_OPTIONS = [
  { code: 'IN', name: 'India' },
  { code: 'FR', name: 'France' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CH', name: 'Switzerland' },
];

const KNOWN_COUNTRY_CODES = COUNTRY_OPTIONS.map((c) => c.code);

const isKnownCountry = (code) =>
  KNOWN_COUNTRY_CODES.includes((code || '').toString().trim().toUpperCase());

module.exports = { COUNTRY_OPTIONS, KNOWN_COUNTRY_CODES, isKnownCountry };
