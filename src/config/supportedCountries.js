/**
 * Backend mirror of frontend src/config/supportedCountries.js.
 * Single source of truth for jurisdiction eligibility gating (OPL-426).
 * Keep both lists in sync; ISO 3166-1 alpha-2 codes.
 *
 * Launch set per client requirement: FR, LT. Configurable via env so ops can
 * enable new jurisdictions without a code deploy.
 */
const configenv = require('./env.config');

const DEFAULT_SUPPORTED_COUNTRIES = ['FR', 'LT'];

const SUPPORTED_COUNTRIES = (configenv.KYC_SUPPORTED_COUNTRIES
  ? configenv.KYC_SUPPORTED_COUNTRIES.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
  : DEFAULT_SUPPORTED_COUNTRIES);

// Full set of countries offered anywhere `Country of Residence` is collected
// (registration forms AND the KYC residency step) — a superset of
// SUPPORTED_COUNTRIES above. Investors/developers from a country in this
// list but NOT in SUPPORTED_COUNTRIES can still register; they land in
// "observer mode" at the KYC residency step (see kycOnboarding's
// isSupportedCountry gate) rather than being rejected outright.
// Keep in sync with frontend src/config/supportedCountries.js#COUNTRY_OPTIONS.
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

const isSupportedCountry = (code) =>
  SUPPORTED_COUNTRIES.includes((code || '').toString().trim().toUpperCase());

const isKnownCountry = (code) =>
  KNOWN_COUNTRY_CODES.includes((code || '').toString().trim().toUpperCase());

module.exports = { SUPPORTED_COUNTRIES, COUNTRY_OPTIONS, KNOWN_COUNTRY_CODES, isSupportedCountry, isKnownCountry };
