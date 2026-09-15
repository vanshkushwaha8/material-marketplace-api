/**
 * @openapi
 * tags:
 *   - name: Admin 2FA
 *     description: >
 *       Two-factor authentication for the admin console: completing the 2FA
 *       challenge at login, enrolling TOTP or email-fallback, switching the
 *       active method, managing recovery codes, and disabling 2FA. The
 *       /2fa/login/* endpoints are public (used with the short-lived
 *       `pendingToken` returned by POST /login when 2FA is required); every
 *       other endpoint requires a full admin bearer session.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/login/send-email:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Send (or resend) the login email OTP
 *     description: >
 *       Sends a one-time code to the admin's configured fallback email as
 *       part of the login 2FA challenge, when email is the active method.
 *       Subject to a 60s resend cooldown. Rate-limited to 5 requests / 15 minutes.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken]
 *             properties:
 *               pendingToken:
 *                 type: string
 *                 description: Short-lived token returned by POST /login when requires2FA is true.
 *     responses:
 *       200:
 *         description: Verification code sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: A verification code has been sent to your email. }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: pendingToken is required, or email fallback 2FA is not configured.
 *       403:
 *         description: Session expired — pendingToken is invalid or expired.
 *       429:
 *         description: Resend requested too soon; wait for the cooldown to elapse.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/login/verify:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Complete login by verifying the 2FA code
 *     description: >
 *       Verifies the TOTP or emailed OTP against the pending login session and,
 *       on success, creates a full session (sets the auth cookie and returns
 *       the session payload). Rate-limited to 5 requests / 15 minutes.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken, otp]
 *             properties:
 *               pendingToken:
 *                 type: string
 *                 description: Short-lived token returned by POST /login when requires2FA is true.
 *               otp:
 *                 type: string
 *                 description: 6-digit TOTP code, or the code emailed via /2fa/login/send-email.
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login complete — full session established.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Welcome back, John Doe!" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     userType: { type: string }
 *       400:
 *         description: pendingToken and otp are required, or the code is invalid/expired.
 *       401:
 *         description: Session expired — pendingToken is invalid or expired, or invalid session.
 *       403:
 *         description: User not found.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/login/recovery:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Complete login using a recovery code
 *     description: >
 *       Alternative to /2fa/login/verify — consumes a single-use recovery code
 *       instead of a TOTP/email OTP, then establishes a full session (sets the
 *       auth cookie). Rate-limited to 5 requests / 15 minutes.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken, recoveryCode]
 *             properties:
 *               pendingToken:
 *                 type: string
 *                 description: Short-lived token returned by POST /login when requires2FA is true.
 *               recoveryCode:
 *                 type: string
 *                 example: A1B2-C3D4-E5F6
 *     responses:
 *       200:
 *         description: Login complete via recovery code — full session established.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Logged in via recovery code. Please review your 2FA settings. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     userType: { type: string }
 *       400:
 *         description: pendingToken and recoveryCode are required, invalid session, or invalid recovery code.
 *       401:
 *         description: Session expired — pendingToken is invalid or expired.
 *       403:
 *         description: User not found.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/totp/provision:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Start TOTP enrollment
 *     description: >
 *       Generates a new TOTP secret and a QR code for the authenticated admin
 *       to scan in an authenticator app. The secret is not persisted until
 *       confirmed via /2fa/totp/verify-setup. Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP provisioned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: 2FA provisioned. Scan the QR code or enter the key manually. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     qrCodeDataUrl:
 *                       type: string
 *                       description: "Base64 data URL of the QR code image to scan."
 *                     manualKey:
 *                       type: string
 *                       description: Base32 secret for manual entry.
 *                     tempSecret:
 *                       type: string
 *                       description: Pass this back unchanged to /2fa/totp/verify-setup.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/totp/verify-setup:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Confirm TOTP enrollment
 *     description: >
 *       Verifies the first code from the authenticator app, persists the TOTP
 *       secret, sets it as the active 2FA method, and issues 10 one-time
 *       recovery codes (shown only once). Rate-limited to 10 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tempSecret, token]
 *             properties:
 *               tempSecret:
 *                 type: string
 *                 description: The tempSecret returned by /2fa/totp/provision.
 *               token:
 *                 type: string
 *                 description: 6-digit code currently shown in the authenticator app.
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: TOTP verified and enrolled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "TOTP verified. Save your recovery codes — they will not be shown again." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recoveryCodes:
 *                       type: array
 *                       items: { type: string }
 *                       example: ["A1B2-C3D4-E5F6", "F6E5-D4C3-B2A1"]
 *       400:
 *         description: tempSecret and token are required, or the TOTP code is invalid.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/email/initiate:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Start email-fallback 2FA enrollment
 *     description: >
 *       Sends a one-time code to the authenticated admin's account email to
 *       begin enrolling email as a 2FA method. Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification code sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: A verification code has been sent to admin@example.com }
 *                 data: { nullable: true, example: null }
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/email/verify-setup:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Confirm email-fallback 2FA enrollment
 *     description: >
 *       Verifies the OTP sent by /2fa/email/initiate, enables email as a 2FA
 *       method, sets it active, and issues 10 one-time recovery codes (shown
 *       only once). Rate-limited to 10 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email fallback verified and enrolled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Email fallback 2FA verified. Save your recovery codes — they will not be shown again." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recoveryCodes:
 *                       type: array
 *                       items: { type: string }
 *                       example: ["A1B2-C3D4-E5F6", "F6E5-D4C3-B2A1"]
 *       400:
 *         description: otp is required, or the OTP is invalid/expired.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/acknowledge-recovery:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Confirm recovery codes were saved and finish enabling 2FA
 *     description: >
 *       Must be called after a TOTP or email setup step to mark the recovery
 *       codes as acknowledged and flip mfaEnabled on for the account.
 *       Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [acknowledged]
 *             properties:
 *               acknowledged:
 *                 type: boolean
 *                 description: Must be exactly true.
 *                 example: true
 *     responses:
 *       200:
 *         description: 2FA enabled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: 2FA is now enabled on your account. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledgedAt: { type: string, format: date-time }
 *       400:
 *         description: acknowledged must be true.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/switch-method:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Switch the active 2FA method
 *     description: >
 *       Switches between totp and email as the active 2FA method. The target
 *       method must already be set up (TOTP verified, or email fallback
 *       enabled). Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [method]
 *             properties:
 *               method:
 *                 type: string
 *                 enum: [totp, email]
 *                 example: email
 *     responses:
 *       200:
 *         description: Active method switched.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Active 2FA method switched to email. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     activeMethod: { type: string, example: email }
 *       400:
 *         description: method is required/invalid, 2FA not enrolled, or the target method isn't set up yet.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/recovery/regenerate:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Regenerate recovery codes
 *     description: >
 *       Invalidates all existing recovery codes and issues 10 new ones,
 *       after verifying the admin's current 2FA code. Rate-limited to 20 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 description: Current TOTP code, or the emailed OTP if email is the active method.
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Recovery codes regenerated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Recovery codes regenerated. Save these now — they will not be shown again." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recoveryCodes:
 *                       type: array
 *                       items: { type: string }
 *                       example: ["A1B2-C3D4-E5F6", "F6E5-D4C3-B2A1"]
 *       400:
 *         description: Current 2FA code is required, 2FA not enrolled, or the code is invalid/expired.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/status:
 *   get:
 *     tags: [Admin 2FA]
 *     summary: Get the authenticated admin's 2FA status
 *     description: Rate-limited to 30 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: 2FA status retrieved. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enrolled: { type: boolean, example: true }
 *                     totpVerified: { type: boolean, example: true }
 *                     emailFallback: { type: boolean, example: false }
 *                     activeMethod: { type: string, example: totp, enum: [totp, email] }
 *                     acknowledged: { type: boolean, example: true }
 *                     recoveryCodesLeft: { type: integer, example: 9 }
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/disable/initiate:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Start disabling 2FA
 *     description: >
 *       For TOTP as the active method, no OTP is sent and the client should
 *       prompt for the current authenticator code directly (requiresOtp:
 *       false). For email as the active method, an OTP is emailed and must be
 *       supplied to /2fa/disable/confirm. Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disable flow initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Proceed with your authenticator code to disable 2FA. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     requiresOtp: { type: boolean, example: false }
 *                     method: { type: string, example: totp, enum: [totp, email] }
 *       400:
 *         description: 2FA is not enabled.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/2fa/disable/confirm:
 *   post:
 *     tags: [Admin 2FA]
 *     summary: Confirm disabling 2FA
 *     description: >
 *       Verifies the current 2FA code and disables 2FA on the account.
 *       Rate-limited to 5 requests / 15 minutes.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 description: Current TOTP code, or the OTP emailed by /2fa/disable/initiate.
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA disabled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: 2FA has been disabled on your account. }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Your current 2FA code is required, or the code is invalid/expired.
 *       401:
 *         description: Unauthorized.
 */