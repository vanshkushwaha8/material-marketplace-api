/**
 * @openapi
 * tags:
 *   - name: Session
 *     description: Manage active device sessions
 */

/**
 * @openapi
 * /api/v1/session/get:
 *   get:
 *     tags: [Session]
 *     summary: Get all active device sessions
 *     description: Returns the list of active sessions/devices for the authenticated user.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Device sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Device sessions retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: "507f1f77bcf86cd799439011" }
 *                       ipAddress: { type: string, example: "192.168.0.1" }
 *                       userId: { type: string }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/v1/session/delete:
 *   post:
 *     tags: [Session]
 *     summary: Delete (log out) a device session
 *     description: Removes a specific active session by its id. The session id is passed as a query parameter.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *         description: Session id to delete
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Device session is deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: "Device session is deleted successfully" }
 *                 data: { type: object, nullable: true, example: null }
 *       400:
 *         description: Validation error (invalid or missing _id)
 *       401:
 *         description: Unauthorized
 */
