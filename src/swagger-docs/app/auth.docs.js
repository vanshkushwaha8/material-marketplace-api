/**
 * @openapi
 * /api/v1/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []   # public endpoint, no token required
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userType, fullName, email, password]
 *             properties:
 *               userType:
 *                 type: string
 *                 enum: [Investor, Owner, Developer]
 *                 example: Investor
 *               fullName:
 *                 type: string
 *                 example: Sumit Kumar
 *               email:
 *                 type: string
 *                 format: email
 *                 example: sumit@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Str0ng@Pass
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *               countryCode:
 *                 type: string
 *                 example: "+91"
 *               countryOfResidence:
 *                 type: string
 *                 example: India
 *               dob:
 *                 type: string
 *                 example: "1995-06-15"
 *               gender:
 *                 type: string
 *                 enum: [M, F, O]
 *                 example: M
 *               termsCondtions:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 description: Terms & Conditions consent document ID (MongoDB ObjectId)
 *                 example: "507f1f77bcf86cd799439011"
 *               cookiesPolicy:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 description: Cookies Policy consent document ID (MongoDB ObjectId)
 *                 example: "507f1f77bcf86cd799439012"
 *               privacyPolicy:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 description: Privacy Policy consent document ID (MongoDB ObjectId)
 *                 example: "507f1f77bcf86cd799439013"
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */

/**
 * @openapi
 * /api/v1/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email/phone and password
 *     description: >
 *       Returns one of three outcomes via the shared authService.completeLogin() helper:
 *       (1) a full session token; (2) if 2FA is enabled, `requires2FA: true` +
 *       `pendingToken` instead of a session token — complete with POST /2fa/login/verify or
 *       /2fa/login/recovery; or (3) if the account's accepted Terms/Privacy are outdated,
 *       `needConsentUpdate: true` + a short-lived, path-restricted `setupToken` — accept via
 *       POST /accept-consent using that token as the Bearer auth, then log in again for a
 *       full session. (Note: /reset/password does NOT use this helper — it always returns a
 *       plain success message with no session; the investor must sign in separately afterward.)
 *     security: []   # public endpoint, no token required
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email or phone number
 *                 example: sumit@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Str0ng@Pass
 *     responses:
 *       200:
 *         description: Login success, 2FA challenge, or consent-update gate — see description above.
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
 *                     _id: { type: string }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     userType: { type: string }
 *                     token: { type: string, description: Full session JWT — absent if requires2FA or needConsentUpdate. }
 *                     mfaEnabled: { type: boolean }
 *                     requires2FA: { type: boolean, description: Present (true) only on the 2FA-challenge outcome. }
 *                     pendingToken: { type: string, description: Present only on the 2FA-challenge outcome; pass to /2fa/login/verify. }
 *                     needConsentUpdate: { type: boolean, description: Present (true) only on the consent-update outcome. }
 *                     setupToken: { type: string, description: Present only on the consent-update outcome; a restricted-scope token, use as Bearer auth for POST /accept-consent. }
 *                     updatedDocuments: { type: array, items: { type: string }, description: Present only on the consent-update outcome. }
 *       400:
 *         description: Incorrect password (includes attemptsRemaining / lock info)
 *       403:
 *         description: Account not found, deleted, unverified, pending, or locked
 */
/**
 * @openapi
 * /api/v1/get-profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get authenticated user profile
 *     description: Returns the profile details of the currently authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User profile fetched successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 6871c7d4c2b9b123456789ab
 *                     fullName:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: john@example.com
 *                     phoneNumber:
 *                       type: string
 *                       example: "+1234567890"
 *                     userType:
 *                       type: string
 *                       example: customer
 *                     profileImage:
 *                       type: string
 *                       nullable: true
 *                       example: https://example.com/profile.jpg
 *                     countryCode:
 *                       type: string
 *                       example: +1
 *                     isEmailVerified:
 *                       type: boolean
 *                       example: true
 *                     isPhoneVerified:
 *                       type: boolean
 *                       example: true
 *                     twoFactorEnabled:
 *                       type: boolean
 *                       example: false
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-07-06T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-07-07T08:15:00.000Z"
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Internal server error.
 */

/**
 * @openapi
 * /api/v1/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Logout user
 *     description: Logs out the authenticated user by invalidating all active sessions associated with the account.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logout successful.
 *                 data:
 *                   nullable: true
 *                   example: null
 *       401:
 *         description: Unauthorized. Authentication token is missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid or expired token.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error.
 */