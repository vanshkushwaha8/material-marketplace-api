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

};

module.exports = messageConstants;
