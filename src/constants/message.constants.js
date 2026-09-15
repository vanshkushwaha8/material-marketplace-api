const messageConstants = {
    UPLOAD: {
        NO_UPLOAD: "No image uploaded",
        SINGLE_IMAGE: "You can't select multiple images",
        IMAGE_UPLOAD: "image Upload Successfully",
    },
    ADMIN: {
        REGISTER_SUCCESS: (name) => `${name} is registered successfully`,
        LOGIN_SUCCESS: (name) => `${name} is login successfully`,
        GOOGLE_LOGIN_SUCCESS: (name) => `${name} is logged in successfully via Google`,
        LOGOUT_SUCCESS: "Logged out successfully",

        EMAIL_EXISTS: "Email already exists",
        WRONG_PASSWORD: "Password is wrong",
        PHONE_EXISTS: "Phone number already exists",
        EMAIL_NOT_EXISTS: "Email not exists",
        USER_NOT_FOUND: "User does not exist",
        ACCOUNT_NOT_FOUND: "Account not found",
        INVALID_CREDENTIALS: "Invalid email or password",

        GOOGLE_EXISTS: "A user with this Google credential already exists as a",


        ACCOUNT_PENDING: (name) => `${name} your account is inactive Please contact to admin`,
        ACCOUNT_DELETED: (name) => `${name} your account is deleted`,
        ACCOUNT_SUSPENDED: (name) => `${name} your account is suspended Please contact to admin`,
        UNAUTHORIZED: "You are not authorized to access this resource",

        OTP_SENT: "Otp is sent to your register email please verify the email",
        OTP_EXPIRED: "OTP has expired Please request a new OTP",
        OTP_INVALID: "Incorrect OTP Please enter the correct OTP",

        PASSWORD_UPDATED: "Password Update successfully",
        OLD_PASSWORD_INCORRECT: "Please Enter correct old password",
        SAME_PASSWORD: "Look like you enter same password",
        INCORRECT_PASSWORD: "Please Enter correct password",

        PROFILE_UPDATED: "Profile updated successfully",
        PROFILE_FETCHED: "User profile fetched successfully",

        ACCOUNT_DELETED_SUCCESS: "Account delete successfully",

        UPDATE_SUCCESS: (name) => `${name} updated successfully`,
        DELETE_SUCCESS: (name) => `${name} deleted successfully`,
        STATUS_UPDATED: "User status updated successfully"
    },

    USER: {
        REGISTER_SUCCESS: (name) => `${name} verification link is sent on you  registered email. Please verify it`,
        LOGIN_SUCCESS: (name) => `${name} is login successfully`,
        GOOGLE_LOGIN_SUCCESS: (name) => `Welcome ${name} is logged in successfully via Google`,
        LOGOUT_SUCCESS: "Logged out successfully",
        EMAIL_NOT_FOUND: "Email not exists",
        EMAIL_EXISTS: "Email already exists",
        PHONE_EXISTS: "Phone number already exists",
        EMAIL_NOT_EXISTS: "Email not exists",
        USER_NOT_FOUND: "User does not exist",
        ACCOUNT_NOT_FOUND: "Account not found",
        INVALID_CREDENTIALS: "Invalid email or password",

        GOOGLE_EXISTS: "A user with this Google credential already exists as a",


        ACCOUNT_PENDING: (name) => `${name} your account is pending Please contact to admin`,
        ACCOUNT_DELETED: (name) => `${name} your account is deleted`,
        ACCOUNT_SUSPENDED: (name) => `${name} your account is suspended Please contact to admin`,
        UNAUTHORIZED: "You are not authorized to access this resource",

        OTP_SENT: "Otp is sent to your register email please verify the email",
        OTP_EXPIRED: "OTP has expired Please request a new OTP",
        LINK_EXPIRED: "Link has expired",
        OTP_INVALID: "Incorrect OTP Please enter the correct OTP",

        PASSWORD_UPDATED: "Password Update successfully",
        OLD_PASSWORD_INCORRECT: "Please Enter correct old password",
        SAME_PASSWORD: "Look like you enter same password",
        INCORRECT_PASSWORD: "Please Enter correct password",

        PROFILE_UPDATED: "Profile updated successfully",
        PROFILE_FETCHED: "User profile fetched successfully",

        ACCOUNT_DELETED_SUCCESS: "Account delete successfully",

        UPDATE_SUCCESS: (name) => `${name} updated successfully`,
        DELETE_SUCCESS: (name) => `${name} deleted successfully`,
        STATUS_UPDATED: "User status updated successfully",

        INVESTOR_DATA: (name) => `${name} Investor List`,
        TRANSACTION_DATA: "Transaction history fetched successfully",
        RESET_PASSWORD_GENERIC: "If an account exists with this email address, a password reset link will be sent.",
        RESET_PASSWORD_LINK_SENT: "Password reset link has been sent successfully. Please check your registered email.",
        RESET_PASSWORD_LINK_ALREADY_SENT: "A password reset link has already been sent. Please check your email and use the existing link. You can request another password reset link after the current one expires.",
        PASSWORD_RESET_LINK_ALREADY_USED: "This password reset link has already been used. Please request a new password reset link.",
        PASSWORD_RESET_LINK_EXPIRED: "This password reset link has expired. Please request a new password reset link.",
        PASSWORD_RESET_LINK_INVALID: "This password reset link is invalid. Please request a new password reset link.",
        PASSWORD_RESET_SUCCESS: "Your password has been reset successfully. Please sign in with your new password.",

        // Consent + MFA login flow (see auth.controller.js login()).
        NEEDS_2FA: "2FA verification started",
        NEEDS_CONSENT_UPDATE: "Updated legal documents require your acceptance.",
        NEEDS_2FA_SETUP_OPTIONAL: "You may set up 2FA to increase your account security.",
    },

    PROJECT: {
        ADD_SUCCESS: (name) => `${name} Project added successfully`,
        UPDATE_SUCCESS: (name) => `${name} Project updated successfully`,
        DELETE_SUCCESS: (name) => `${name} Project deleted successfully`,
        STATUS_UPDATED: "Project status updated successfully",
        SINGLE_DATA: "Single Project Data",
        PROJECT_DATA: "Project List",
        NOT_FOUND: "Project not found",
        ADD_WISHLIST: (title) => `${title} Added To Wishlist Successfully`,
        REMOVE_WISHLIST: (title) => `${title} Removed From Wishlist Successfully`,
        WISHLIST: "Wishlist Project Fetched",
        
        DRAFT_CREATED: "Draft project created",
        DRAFT_UPDATED: "Draft saved",
        DRAFT_LIST: "Your projects",
        CHECKLIST_FETCHED: "Submission checklist fetched",
        SUBMITTED: "Project submitted for review",
        ARCHIVED: "Project archived. You can restore it within 30 days.",
        RESTORED: "Project restored",
        DELETED: "Project deleted",
    },

    INVESTOR: {
        PAYMENT_SUCCESS: `Payment intent created`,
        INVESTMENT_SUCCESS: `Investment completed successfully`,
        SINGLE_INVEST: "My investments fetched",
        PROJECT_INVEST: "Project investments fetched",
        INVESTMENT_CREATE: "Thank you for the investment",
        NOT_FOUND: "Project Not Found!",
        MINIMUN_INVESTMENT: "Minimum investment is",
        EXCEED_AMOUNT: "Investment exceeds target amount",
        TOP_CITY: "Top cities by investment value",
        PROPERTY_DISTRIBUTION: "Property distribution data",
        SELL_SUCCESS: "Investment sold successfully",
        REINVEST_SUCCESS: "Reinvestment successful",
        ORDER_HISTORY: "Order history fetched successfully"
    },

    DOCUMENT: {
        PERFORMANCE_GENERATED: "Performance report generated successfully",
        MONTHLY_GENERATED: "Monthly statement generated successfully",
        TAX_GENERATED: "Tax report generated successfully",
        CONTRACT_GENERATED: "Investment contract generated successfully"
    },

    KYC: {
        INITIATED: 'KYC session initiated successfully',
        STATUS_FETCHED: 'KYC status retrieved successfully',
        WEBHOOK_OK: 'Webhook processed successfully',
        NOT_FOUND: 'KYC record not found',
        ALREADY_VERIFIED: 'User is already KYC verified',

        PROGRESS_FETCHED: 'KYC progress retrieved successfully',
        STEP_STARTED: 'Step marked in progress',
        STEP_COMPLETED: 'Step saved successfully',
        STEP_UNDER_REVIEW: 'Submitted for review',
        INVALID_STEP: 'Unknown or unsupported KYC step',
        INVALID_TRANSITION: (from, to) => {
            // This message is shown to the investor directly (the global axios
            // interceptor toasts response.data.message on 400s) — raw internal
            // state names like "not_started"/"in_progress" read as a developer
            // error, not guidance. Give people something actionable instead.
            if (from === 'done') {
                return "This step has already been completed. Please refresh the page — no further action is needed here.";
            }
            if (from === 'under_review') {
                return "This step is currently under review and can't be changed right now. We'll email you once a decision has been made.";
            }
            return 'Please complete the required step(s) before this one, then try again.';
        },
        RESIDENCY_UNSUPPORTED: 'This country is not yet supported for investing. You can continue in observer mode (read-only, no investing).',

        DOCUMENT_SAVED: 'Document saved successfully',
        DOCUMENT_NOT_FOUND: 'No document found for this slot yet',
        DOCUMENT_QUALITY_FAILED: (reason) => `We couldn't use that file (${reason}). Please retake and try again.`,

        LOSS_SIM_COMPUTED: 'Loss-bearing capacity computed',
        LOSS_SIM_SOPHISTICATED_SKIP: 'Sophisticated investors are not required to complete this simulation',

        KNOWLEDGE_TEST_STARTED: 'Knowledge test attempt started',
        KNOWLEDGE_TEST_SUBMITTED: 'Knowledge test submitted',
        KNOWLEDGE_TEST_SOPHISTICATED_SKIP: 'Sophisticated investors are not required to take this test',
        KNOWLEDGE_TEST_WARNING_REQUIRED: 'Please acknowledge the risk warning before continuing',

        SOPHISTICATION_SUBMITTED: 'Your sophisticated-investor application has been submitted for review',

        MOBILE_RELAY_CREATED: 'Mobile capture link created',
        MOBILE_RELAY_INVALID: 'This capture link is invalid or has expired',
        MOBILE_RELAY_UPLOADED: 'Capture received',

        KYB_NOT_YET_SUPPORTED: 'Legal-entity onboarding is being finalised for your jurisdiction. Your details have been saved and our team will follow up.',
    },

    COMMON: {
        VALIDATION_ERROR: "Validation error",
        BAD_REQUEST: "Bad request",
        ACCESS_DENIED: "Access denied",
        SOMETHING_WENT_WRONG: "Something went wrong",
        INTERNAL_SERVER_ERROR: "Internal server error"
    },
};

module.exports = messageConstants;
