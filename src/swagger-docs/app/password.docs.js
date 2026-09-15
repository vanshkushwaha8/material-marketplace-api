/**
 * @openapi
 * tags:
 *   - name: Password
 *     description: Email verification and password change (forgot-password request/reset already documented separately).
 */

/**
 * @openapi
 * /api/v1/emailVerification:
 *   get:
 *     tags: [Password]
 *     summary: Verify an email address via the link sent at registration
 *     description: >
 *       Renders an HTML landing page (not JSON) reflecting the verification outcome —
 *       invalid link, expired link (with a resend option), already verified, or freshly
 *       verified (with a continue-to-2FA-setup link).
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: HTML confirmation page.
 *         content:
 *           text/html:
 *             schema: { type: string }
 */

/**
 * @openapi
 * /api/v1/resend-verification:
 *   post:
 *     tags: [Password]
 *     summary: Resend the email-verification link
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *     responses:
 *       200:
 *         description: Verification email sent successfully.
 *       400:
 *         description: Validation error, or user not found.
 */

/**
 * @openapi
 * /api/v1/check-password-reset:
 *   get:
 *     tags: [Password]
 *     summary: Check whether a password-reset token exists
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Token found — proceed to reset the password before it expires.
 *       400:
 *         description: Token is required on query params.
 *       403:
 *         description: This reset link is invalid or has expired.
 */

/**
 * @openapi
 * /api/v1/validate-reset-token:
 *   get:
 *     tags: [Password]
 *     summary: Validate a password-reset token (checks used/expired state)
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Reset link is valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Reset link is valid. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid: { type: boolean, example: true }
 *       400:
 *         description: >
 *           Token is invalid, already used, or expired — response includes `valid` (false),
 *           `reason`, and `canResend` where applicable.
 */

/**
 * @openapi
 * /api/v1/changePassword:
 *   post:
 *     tags: [Password]
 *     summary: Change the authenticated user's password
 *     description: >
 *       Requires the correct current password, rejects reusing the same password, and
 *       rejects a new password that is too similar to the user's own name, email, or phone
 *       number.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 12
 *                 maxLength: 64
 *                 description: Must include an uppercase letter, a lowercase letter, a number, and a special character.
 *     responses:
 *       200:
 *         description: Password updated successfully.
 *       400:
 *         description: Validation error, incorrect old password, same-as-old password, or new password too similar to personal info.
 *       401:
 *         description: Unauthorized.
 */
