/**
 * @openapi
 * tags:
 *   - name: Admin Audit Log
 *     description: Compliance/audit trail of user and admin actions.
 */

/**
 * @openapi
 * /api/admin/v1/auditlog/get:
 *   get:
 *     tags: [Admin Audit Log]
 *     summary: List audit log entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Filter by a specific audit action (see /auditlog/getActionOptions for valid values).
 *       - in: query
 *         name: entity
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Audit log entries retrieved successfully.
 *       401:
 *         description: Unauthorized.
 */

/**
 * @openapi
 * /api/admin/v1/auditlog/getActionOptions:
 *   get:
 *     tags: [Admin Audit Log]
 *     summary: Get the list of possible audit-log action types
 *     description: Used to populate the action filter dropdown on the audit log screen.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Action options retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items: { type: string }
 *       401:
 *         description: Unauthorized.
 */
