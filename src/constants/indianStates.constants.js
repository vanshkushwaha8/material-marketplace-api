// Server-side source of truth for "is this a real Indian state/UT" checks
// on registration/store-profile location input. Names match exactly what
// the frontend's `country-state-city` package returns for country 'IN'
// (see MarketplaceRegister.jsx's state/city selects), so a value that
// passed the frontend dropdown always passes here too. Never trust a
// free-typed state string from the client without checking it against
// this list — see auth.validation.js / storeProfile.validation.js.
const INDIAN_STATES = Object.freeze([
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]);

// Rough India mainland+islands bounding box — used only as a sanity check
// on optional lat/lng captured from "Use Current Location" or the address
// autocomplete, never as the sole source of truth for where someone is.
const INDIA_LAT_RANGE = [6, 38];
const INDIA_LNG_RANGE = [68, 98];

module.exports = { INDIAN_STATES, INDIA_LAT_RANGE, INDIA_LNG_RANGE };
