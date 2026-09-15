/**
 * @openapi
 * tags:
 *   - name: 2FA
 *     description: Two-factor authentication setup, login, and management
 */

/**
 * @openapi
 * /api/v1/2fa/totp/provision:
 *   post:
 *     tags: [2FA]
 *     summary: Provision TOTP (generate QR + secret)
 *     description: Returns a temporary secret and QR code to scan in an authenticator app.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 2FA provisioned; scan the QR or enter the key manually
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tempSecret: { type: string }
 *                     qrCode: { type: string, description: Data URL of the QR image }
 *                     otpauthUrl: { type: string }
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/totp/verify-setup:
 *   post:
 *     tags: [2FA]
 *     summary: Verify TOTP setup
 *     description: Confirms the code from the authenticator app and returns recovery codes (shown once).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tempSecret, token]
 *             properties:
 *               tempSecret: { type: string, description: The secret from /provision }
 *               token: { type: string, example: "123456", description: 6-digit code from the app }
 *     responses:
 *       200:
 *         description: TOTP verified; recovery codes returned
 *       400:
 *         description: tempSecret and token are required, or invalid code
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/email/initiate:
 *   post:
 *     tags: [2FA]
 *     summary: Initiate email 2FA fallback setup
 *     description: Sends an OTP to the provided email to set it up as a fallback factor.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: OTP sent to email
 *       400:
 *         description: email is required
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/email/verify-setup:
 *   post:
 *     tags: [2FA]
 *     summary: Verify email 2FA fallback setup
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Email fallback verified; recovery codes returned
 *       400:
 *         description: email and otp are required
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/acknowledge-recovery:
 *   post:
 *     tags: [2FA]
 *     summary: Acknowledge recovery codes and enable 2FA
 *     description: >
 *       Must be called after the user confirms they saved their recovery codes. This is the
 *       call that actually flips the account's `mfaEnabled` to `true` — but its own response
 *       does NOT echo that flag back (only `acknowledgedAt`). A client that needs to update
 *       its UI immediately (e.g. show "2FA enabled ✓") has to make a separate GET /2fa/status
 *       call to confirm it, or just trust the 200 and update local state optimistically.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [acknowledged]
 *             properties:
 *               acknowledged: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: 2FA enabled (mfaEnabled is now true on the account, though this response body doesn't include it — see description).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledgedAt: { type: string, format: date-time }
 *       400:
 *         description: You must confirm you have saved your recovery codes
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/switch-method:
 *   post:
 *     tags: [2FA]
 *     summary: Switch active 2FA method
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [method]
 *             properties:
 *               method: { type: string, enum: [totp, sms, email], example: totp }
 *     responses:
 *       200:
 *         description: Active method switched
 *       400:
 *         description: method is required
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/login/send-email:
 *   post:
 *     tags: [2FA]
 *     summary: Send login OTP email (during 2FA login challenge)
 *     description: Public. Uses the pendingToken issued by /login when 2FA is required.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken]
 *             properties:
 *               pendingToken: { type: string }
 *     responses:
 *       200:
 *         description: OTP sent
 *       400:
 *         description: pendingToken is required
 *       403:
 *         description: Session expired; please log in again
 */

/**
 * @openapi
 * /api/v1/2fa/login/verify:
 *   post:
 *     tags: [2FA]
 *     summary: Verify 2FA factor and complete login
 *     description: Public. Returns the session token on success.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken, otp]
 *             properties:
 *               pendingToken: { type: string }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Login complete; session token returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string, description: JWT }
 *                     _id: { type: string }
 *                     fullName: { type: string }
 *       400:
 *         description: pendingToken and otp are required
 *       403:
 *         description: User not found / invalid factor
 */

/**
 * @openapi
 * /api/v1/2fa/login/recovery:
 *   post:
 *     tags: [2FA]
 *     summary: Log in using a recovery code
 *     description: Public. Fallback when the user cannot access their 2FA device.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pendingToken, recoveryCode]
 *             properties:
 *               pendingToken: { type: string }
 *               recoveryCode: { type: string }
 *     responses:
 *       200:
 *         description: Logged in via recovery code
 *       400:
 *         description: pendingToken and recoveryCode are required
 *       403:
 *         description: User not found / invalid recovery code
 */

/**
 * @openapi
 * /api/v1/2fa/recovery/regenerate:
 *   post:
 *     tags: [2FA]
 *     summary: Regenerate recovery codes
 *     description: Requires the current 2FA code. Returns new codes (shown once).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Recovery codes regenerated
 *       400:
 *         description: Current 2FA code is required
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/status:
 *   get:
 *     tags: [2FA]
 *     summary: Get 2FA status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 2FA status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     mfaEnabled: { type: boolean }
 *                     activeMethod: { type: string, enum: [totp, sms, email] }
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/disable/initiate:
 *   post:
 *     tags: [2FA]
 *     summary: Initiate 2FA disable
 *     description: Triggers the challenge (e.g. email OTP) needed to confirm disabling 2FA.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Proceed with your code to disable 2FA
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/2fa/disable/confirm:
 *   post:
 *     tags: [2FA]
 *     summary: Confirm and disable 2FA
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       400:
 *         description: Your current 2FA code is required
 *       401:
 *         description: Unauthorized
 */
