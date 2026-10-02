/**
 * @openapi
 * /api/admin/v1/forgot-password:
 *   post:
 *     tags: [Admin Password]
 *     summary: Email a password-reset link to an admin or staff account
 *     description: >
 *       Always answers with the same generic message, whether or not the email belongs to an
 *       admin account. Only active accounts that have already set a password get a link (an
 *       invited staff member uses their invitation link). The link is single-use, expires in
 *       1 hour, and replaces any earlier link. At most one email per account per minute.
 *     security: []
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
 *         description: Generic "if an account exists…" message.
 *       400:
 *         description: Email missing or malformed.
 *       429:
 *         description: Too many requests.
 */

/**
 * @openapi
 * /api/admin/v1/reset-password/validate:
 *   get:
 *     tags: [Admin Password]
 *     summary: Check an admin reset link without using it
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           `data.valid` true, or false with `data.reason` INVALID | EXPIRED | USED | REVOKED
 *           and a user-facing `message`.
 */

/**
 * @openapi
 * /api/admin/v1/reset-password:
 *   post:
 *     tags: [Admin Password]
 *     summary: Set a new admin password with a reset link
 *     description: >
 *       Consumes the token atomically (it can never be used again), stores the bcrypt hash,
 *       revokes every other outstanding link for the account, clears any login lockout and
 *       signs the account out everywhere. Invitation links are rejected here.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, format: password, minLength: 12, maxLength: 64 }
 *     responses:
 *       200:
 *         description: Password reset.
 *       400:
 *         description: >
 *           Validation error, password too similar to name/email (`reason` WEAK_PASSWORD), or the
 *           link can't be used (`reason` INVALID | EXPIRED | USED | REVOKED).
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/invitation/validate:
 *   get:
 *     tags: [Admin Password]
 *     summary: Check a staff invitation link before asking for a password
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           `data.valid` true, or false with `data.reason` ALREADY_SET (password already set —
 *           use Forgot Password) | EXPIRED | REVOKED (replaced by a newer invitation) | INVALID.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/passwordset:
 *   put:
 *     tags: [Admin Password]
 *     summary: Set the initial password from a staff invitation link
 *     description: >
 *       Works once, only while the staff member has no password. Afterwards the link (and any
 *       other invitation for the account) is permanently unusable; password changes go through
 *       Forgot Password.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, format: password, minLength: 12, maxLength: 64 }
 *     responses:
 *       200:
 *         description: Password set; sign in at /admin/login.
 *       400:
 *         description: >
 *           `code`/`data.reason` ALREADY_SET ("Password has already been set. This link is no longer
 *           valid…"), EXPIRED, REVOKED, INVALID, or WEAK_PASSWORD.
 */
