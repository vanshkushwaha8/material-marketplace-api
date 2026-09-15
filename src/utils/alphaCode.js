const ALPHA2_TO_ALPHA3 = {
    FR: "FRA", LT: "LTU", DE: "DEU", ES: "ESP", IT: "ITA", NL: "NLD",
    BE: "BEL", IE: "IRL", PT: "PRT", GB: "GBR", US: "USA", CH: "CHE",
};
function toAlpha3(code) {
    if (!code) return code;
    const upper = String(code).toUpperCase();
    if (upper.length === 3) return upper;
    return ALPHA2_TO_ALPHA3[upper] || upper; 
}
module.exports=toAlpha3