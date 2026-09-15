/**
 * @openapi
 * /api/v1/request/password:
 *   post:
 *     tags: [resetPassword]
 *     summary: Request a password reset link
 *     description: >
 *       Sends a password reset link to the account email. Always returns 200 —
 *       the response message does not confirm whether the email exists (to reduce
 *       account enumeration).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: sumit@example.com
 *     responses:
 *       200:
 *         description: Reset link sent (or generic message if account not found)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "A reset link has been sent." }
 *                 data: { type: object, nullable: true, example: null }
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/reset/password:
 *   post:
 *     tags: [resetPassword]
 *     summary: Reset password using a reset token
 *     description: >
 *       Consumes the one-time reset token and sets a new password. The token is
 *       single-use and time-limited.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The reset token from the emailed link
 *                 example: "a1b2c3d4e5f6..."
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "Str0ng@Pass"
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Password updated successfully." }
 *                 data: { type: object, nullable: true, example: null }
 *       400:
 *         description: Invalid or expired reset link
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: false }
 *                 message: { type: string, example: "This reset link is invalid or has expired. Please request a new one." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     canResend: { type: boolean, example: true }
 *       403:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
;