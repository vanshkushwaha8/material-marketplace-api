const roleModel = require("../model/role.model");
const CAP = require("../constants/capability.constants");
const { ADMIN_ROLES } = require("../constants/adminRoles.constants");

const rolesSeedData = [
    {
        name: ADMIN_ROLES.SUPER_ADMIN,
        description: "Full system access. Manages admins and roles.",
        isSystemRole: true,
        status: "active",
        permissions: [
            CAP.REVIEW_DECIDE_KYC,
            CAP.COMPLIANCE_GATE_SIGNOFF,
            CAP.INVESTMENT_COMMITTEE_REVIEW,
            CAP.PUBLISH_PROJECT,
            CAP.APPROVE_ISSUER_RELEASE,
            CAP.HANDLE_SUPPORT_INQUIRIES,
            CAP.MANAGE_ADMINS_ROLES,
            CAP.VIEW_AUDIT_LOG,
            CAP.EXPORT_REPORTS
        ]
    },
    {
        name: ADMIN_ROLES.COMPLIANCE_OFFICER,
        description: "Handles KYC review and compliance sign-off.",
        isSystemRole: false,
        status: "active",
        permissions: [CAP.REVIEW_DECIDE_KYC, CAP.COMPLIANCE_GATE_SIGNOFF, CAP.VIEW_AUDIT_LOG, CAP.EXPORT_REPORTS]
    },
    {
        name: ADMIN_ROLES.CREDIT_COMMITTEE,
        description: "Reviews and votes on investment/project proposals.",
        isSystemRole: false,
        status: "active",
        permissions: [CAP.INVESTMENT_COMMITTEE_REVIEW, CAP.VIEW_AUDIT_LOG, CAP.EXPORT_REPORTS]
    },
    {
        name: ADMIN_ROLES.OPERATIONS_ADMIN,
        description: "Handles issuer release approvals and day-to-day ops.",
        isSystemRole: false,
        status: "active",
        permissions: [CAP.APPROVE_ISSUER_RELEASE, CAP.HANDLE_SUPPORT_INQUIRIES, CAP.VIEW_AUDIT_LOG, CAP.EXPORT_REPORTS]
    },
    {
        name: ADMIN_ROLES.SUPPORT_AGENT,
        description: "Handles support inquiries only.",
        isSystemRole: false,
        status: "active",
        permissions: [CAP.HANDLE_SUPPORT_INQUIRIES, CAP.EXPORT_REPORTS]
    },
    {
        name: ADMIN_ROLES.AUDITOR,
        description: "Read-only access to audit logs and reports.",
        isSystemRole: false,
        status: "active",
        permissions: [CAP.VIEW_AUDIT_LOG, CAP.EXPORT_REPORTS]
    }
];

const seedRoles = async () => {
    for (const role of rolesSeedData) {
        await roleModel.updateOne(
            { name: role.name, is_deleted: "0" },
            { $set: role },
            { upsert: true }
        );
    }
    console.log("✅ Fixed admin roles seeded successfully");
};

module.exports = seedRoles;