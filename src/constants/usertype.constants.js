// Renamed from the investment-domain roles (Investor/Developer) to the
// marketplace roles (Buyer/Seller) as part of the construction-materials
// marketplace pivot. Owner/ComplianceOfficer kept — generic staff-side
// roles, unrelated to the removed investment domain.
const userTypeConstants={
    Buyer:"Buyer",
    Seller:"Seller",
    Owner:"Owner",
    ComplianceOfficer:"ComplianceOfficer"
}
module.exports=userTypeConstants
