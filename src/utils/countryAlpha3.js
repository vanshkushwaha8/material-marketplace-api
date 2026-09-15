const countries = require("i18n-iso-countries");
const enLocale = require("i18n-iso-countries/langs/en.json");

countries.registerLocale(enLocale);

function getAlpha3CountryCode(country) {
  if (!country) return null;

  const input = country.toString().trim();

  // If already alpha-3 (IND, USA etc.)
  if (input.length === 3 && /^[A-Za-z]{3}$/.test(input)) {
    return input.toUpperCase();
  }

  // The identity wizard (issuingCountry, countryOfResidence) stores plain
  // ISO alpha-2 codes ("FR", "US" — see kycProgress.schema.js), not country
  // names. getAlpha3Code() below expects a *name*, so alpha-2 input needs
  // its own conversion path — without this, every alpha-2 code silently
  // resolved to null and any caller that hard-requires a country (e.g.
  // Sumsub's idDocs entries) would fail.
  if (input.length === 2 && /^[A-Za-z]{2}$/.test(input)) {
    const fromAlpha2 = countries.alpha2ToAlpha3(input.toUpperCase());
    if (fromAlpha2) return fromAlpha2;
  }

  // Convert name to alpha-3
  const alpha3 =
    countries.getAlpha3Code(input, "en") ||
    countries.getAlpha3Code(input.toUpperCase(), "en");

  return alpha3 || null; // return null if invalid country
}

module.exports = getAlpha3CountryCode;