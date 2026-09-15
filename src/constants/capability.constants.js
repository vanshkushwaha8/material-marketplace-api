const capabilityConstants = {
    REVIEW_DECIDE_KYC: "REVIEW_DECIDE_KYC",
    COMPLIANCE_GATE_SIGNOFF: "COMPLIANCE_GATE_SIGNOFF",
    INVESTMENT_COMMITTEE_REVIEW: "INVESTMENT_COMMITTEE_REVIEW",
    PUBLISH_PROJECT: "PUBLISH_PROJECT",
    APPROVE_ISSUER_RELEASE: "APPROVE_ISSUER_RELEASE",
    HANDLE_SUPPORT_INQUIRIES: "HANDLE_SUPPORT_INQUIRIES",
    MANAGE_ADMINS_ROLES: "MANAGE_ADMINS_ROLES",
    VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
    EXPORT_REPORTS: "EXPORT_REPORTS",

    LABELS: {
        REVIEW_DECIDE_KYC: "Review & decide KYC",
        COMPLIANCE_GATE_SIGNOFF: "Compliance gate sign-off",
        INVESTMENT_COMMITTEE_REVIEW: "Investment Committee review",
        PUBLISH_PROJECT: "Publish project (final gate)",
        APPROVE_ISSUER_RELEASE: "Approve issuer release / withdrawals",
        HANDLE_SUPPORT_INQUIRIES: "Handle support inquiries",
        MANAGE_ADMINS_ROLES: "Manage admins & roles",
        VIEW_AUDIT_LOG: "View audit log",
        EXPORT_REPORTS: "Export reports"
    }
};

module.exports = capabilityConstants;