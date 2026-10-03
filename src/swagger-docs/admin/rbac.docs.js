/**
 * @openapi
 * tags:
 *   - name: Admin Role
 *     description: >
 *       Staff roles — a name plus permission keys from the code-defined
 *       catalog (constants/rbac.constants.js). Super Admin only
 *       (reserved permission role:manage). Permission changes take effect on
 *       the staff member's next request.
 */

/**
 * @openapi
 * /api/admin/v1/role/catalog:
 *   get:
 *     tags: [Admin Role]
 *     summary: Permission catalog (grouped by module) for the role editor
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           `data` is an array of `{ module, permissions: [{ key, label }] }`.
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 */

/**
 * @openapi
 * /api/admin/v1/role/get:
 *   get:
 *     tags: [Admin Role]
 *     summary: List staff roles (paginated)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string } }
 *     responses:
 *       200:
 *         description: >
 *           `data.getData` = roles `{ _id, roleName, description, permissions[], status, memberCount }`,
 *           `data.count` = total.
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 */

/**
 * @openapi
 * /api/admin/v1/role/add:
 *   post:
 *     tags: [Admin Role]
 *     summary: Create a staff role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleName, permissions]
 *             properties:
 *               roleName: { type: string, minLength: 2, maxLength: 50, example: Finance }
 *               description: { type: string, maxLength: 200 }
 *               permissions:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, example: "payment:read" }
 *     responses:
 *       200: { description: Role created. }
 *       400: { description: Validation error (unknown or reserved permission key, missing name). }
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 *       409: { description: A role with this name already exists. }
 */

/**
 * @openapi
 * /api/admin/v1/role/update:
 *   put:
 *     tags: [Admin Role]
 *     summary: Rename a role / replace its permission set
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [_id, roleName, permissions]
 *             properties:
 *               _id: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *               roleName: { type: string }
 *               description: { type: string }
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Role updated. }
 *       400: { description: Validation error. }
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 *       404: { description: Role not found. }
 *       409: { description: Name already in use. }
 */

/**
 * @openapi
 * /api/admin/v1/role/delete:
 *   delete:
 *     tags: [Admin Role]
 *     summary: Delete a role (only when no staff member holds it)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: _id, required: true, schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' } }
 *     responses:
 *       200: { description: Role deleted. }
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 *       404: { description: Role not found. }
 *       409: { description: Role is still assigned to staff. }
 */

/**
 * @openapi
 * /api/admin/v1/role/status:
 *   patch:
 *     tags: [Admin Role]
 *     summary: Activate / deactivate a role
 *     description: Deactivating removes every permission from the role's staff immediately.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: _id, required: true, schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' } }
 *     responses:
 *       200: { description: Status toggled. }
 *       401: { description: Not authenticated. }
 *       403: { description: Not the Super Admin. }
 *       404: { description: Role not found. }
 */
