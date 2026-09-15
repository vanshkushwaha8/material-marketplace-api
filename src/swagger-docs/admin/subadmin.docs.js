/**
 * @openapi
 * tags:
 *   - name: Admin Sub-Admin
 *     description: >
 *       Manage sub-admin (staff) accounts on the admin console. All endpoints except
 *       /subadmin/passwordset require a valid admin bearer session and a completed
 *       2FA check, and are gated by RBAC permission (PERMISSIONSCONSTANTS.SUBADMIN.*).
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/add:
 *   post:
 *     tags: [Admin Sub-Admin]
 *     summary: Invite a new sub-admin
 *     description: >
 *       Creates a sub-admin account in a pending state and emails them an invitation
 *       link (valid 24h) to set their password via PUT /subadmin/passwordset.
 *       Requires permission SUBADMIN.ADMIN_ADD.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, fullName, email]
 *             properties:
 *               roleId:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 description: MongoDB ObjectId of the role to assign.
 *                 example: "6871c7d4c2b9b123456789ab"
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 30
 *                 example: Priya Sharma
 *               email:
 *                 type: string
 *                 format: email
 *                 example: priya@example.com
 *               profilePicture:
 *                 type: string
 *                 description: Optional filename/key of a previously uploaded image.
 *                 example: ""
 *     responses:
 *       200:
 *         description: Invitation sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Invitation is sent successfully to sub-admin }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_ADD permission.
 *       409:
 *         description: Email already exists.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/update:
 *   put:
 *     tags: [Admin Sub-Admin]
 *     summary: Update a sub-admin
 *     description: Requires permission SUBADMIN.ADMIN_EDIT. Role changes are audit-logged with the actor.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [_id, fullName, roleId, email]
 *             properties:
 *               _id:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ab"
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 30
 *                 example: Priya Sharma
 *               roleId:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ac"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: priya@example.com
 *               profilePicture:
 *                 type: string
 *                 example: ""
 *     responses:
 *       200:
 *         description: Sub-admin updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Sub-admin updated successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_EDIT permission.
 *       404:
 *         description: Sub-admin not found.
 *       409:
 *         description: Email already in use by another admin.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/get:
 *   get:
 *     tags: [Admin Sub-Admin]
 *     summary: List sub-admins
 *     description: Paginated, searchable list of sub-admin accounts (excludes the super admin). Requires permission SUBADMIN.ADMIN_VIEW.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match against role name.
 *     responses:
 *       200:
 *         description: Sub-admin list fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Sub-admin fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     getData:
 *                       type: array
 *                       items: { type: object }
 *                     count: { type: integer, example: 12 }
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_VIEW permission.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/resend:
 *   get:
 *     tags: [Admin Sub-Admin]
 *     summary: Resend a sub-admin's invitation
 *     description: >
 *       Re-sends the invite email with a fresh 24h token, provided the sub-admin
 *       hasn't already accepted and no active invitation is currently pending.
 *       Requires permission SUBADMIN.ADMIN_ADD.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ab"
 *     responses:
 *       200:
 *         description: Invitation resent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Invitation is sent successfully to sub-admin }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error, invitation already accepted, or an invitation is already pending.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_ADD permission.
 *       404:
 *         description: Sub-admin not found.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/passwordset:
 *   put:
 *     tags: [Admin Sub-Admin]
 *     summary: Set password from an invitation link
 *     description: >
 *       Public endpoint (no bearer auth) used by an invited sub-admin to set their
 *       initial password using the token emailed to them. Rate-limited to 5
 *       requests / 15 minutes per IP.
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
 *                 description: Raw invitation token from the emailed link.
 *                 example: 7c9e6b1a4f3d4e2eae0f9c0b1a2d3e4f...
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: Str0ng@Pass
 *     responses:
 *       200:
 *         description: Password set successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Password set successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error, invalid/expired token, or password does not meet policy.
 *       429:
 *         description: Too many attempts — rate limit exceeded.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/delete:
 *   delete:
 *     tags: [Admin Sub-Admin]
 *     summary: Delete (soft-delete) a sub-admin
 *     description: Requires permission SUBADMIN.ADMIN_DELETE. The super admin account cannot be deleted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ab"
 *     responses:
 *       200:
 *         description: Sub-admin deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Sub-admin deleted successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_DELETE permission, or attempting to delete the super admin.
 *       404:
 *         description: Sub-admin not found.
 */

/**
 * @openapi
 * /api/admin/v1/subadmin/status:
 *   get:
 *     tags: [Admin Sub-Admin]
 *     summary: Toggle a sub-admin's active/inactive status
 *     description: Flips status between active and inactive. Requires permission SUBADMIN.ADMIN_STATUS_CHANGE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ab"
 *     responses:
 *       200:
 *         description: Sub-admin status changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Sub-admin status changed successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing SUBADMIN.ADMIN_STATUS_CHANGE permission.
 *       404:
 *         description: Sub-admin not found.
 */
