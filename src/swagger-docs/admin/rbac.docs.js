/**
 * @openapi
 * tags:
 *   - name: Admin Module
 *     description: Manage the modules (feature areas) that permissions and routes are grouped under.
 *   - name: Admin Permission
 *     description: Manage individual permissions, each scoped to a module.
 *   - name: Admin Role
 *     description: >
 *       Manage admin roles and the permission sets attached to them. Mutations
 *       (add/update/delete) are restricted to the Super Admin.
 */

// ===================== MODULE =====================

/**
 * @openapi
 * /api/admin/v1/module/add:
 *   post:
 *     tags: [Admin Module]
 *     summary: Create a module
 *     description: Requires permission MODULEVIEW.MODULE_ADD.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moduleName, route, moduleDisplayName]
 *             properties:
 *               moduleName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: subadmin
 *               route:
 *                 type: string
 *                 example: /subadmin
 *               moduleDisplayName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: Sub Admin Management
 *     responses:
 *       200:
 *         description: Module created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Module created successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing MODULEVIEW.MODULE_ADD permission.
 */

/**
 * @openapi
 * /api/admin/v1/module/update:
 *   put:
 *     tags: [Admin Module]
 *     summary: Update a module
 *     description: Requires permission MODULEVIEW.MODULE_EDIT.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [_id, moduleName, route, moduleDisplayName]
 *             properties:
 *               _id:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ad"
 *               moduleName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: subadmin
 *               route:
 *                 type: string
 *                 example: /subadmin
 *               moduleDisplayName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: Sub Admin Management
 *     responses:
 *       200:
 *         description: Module updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Module updated successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing MODULEVIEW.MODULE_EDIT permission.
 *       404:
 *         description: Module not found.
 */

/**
 * @openapi
 * /api/admin/v1/module/get:
 *   get:
 *     tags: [Admin Module]
 *     summary: List modules
 *     description: Paginated, searchable list of modules. Requires permission MODULEVIEW.MODULE_VIEW.
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
 *         description: Case-insensitive match against moduleName or moduleDisplayName.
 *     responses:
 *       200:
 *         description: Module list fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Module fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     getData:
 *                       type: array
 *                       items: { type: object }
 *                     count: { type: integer, example: 8 }
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing MODULEVIEW.MODULE_VIEW permission.
 */

/**
 * @openapi
 * /api/admin/v1/module/delete:
 *   delete:
 *     tags: [Admin Module]
 *     summary: Delete (soft-delete) a module
 *     description: Requires permission MODULEVIEW.MODULE_DELETE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ad"
 *     responses:
 *       200:
 *         description: Module deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Module deleted successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing MODULEVIEW.MODULE_DELETE permission.
 *       404:
 *         description: Module not found.
 */

/**
 * @openapi
 * /api/admin/v1/module/status:
 *   get:
 *     tags: [Admin Module]
 *     summary: Toggle a module's active/inactive status
 *     description: Flips status between active and inactive. Requires permission MODULEVIEW.MODULE_STATUS_CHANGE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ad"
 *     responses:
 *       200:
 *         description: Module status changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Module status changed successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing MODULEVIEW.MODULE_STATUS_CHANGE permission.
 *       404:
 *         description: Module not found.
 */

// ===================== PERMISSION =====================

/**
 * @openapi
 * /api/admin/v1/permission/add:
 *   post:
 *     tags: [Admin Permission]
 *     summary: Create a permission
 *     description: Requires permission PERMISSION.PERMISSION_ADD.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moduleId, modulePermission, moduleDisplayPermission]
 *             properties:
 *               moduleId:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ad"
 *               modulePermission:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 70
 *                 example: SUBADMIN.ADMIN_ADD
 *               moduleDisplayPermission:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 70
 *                 example: Add Sub Admin
 *     responses:
 *       200:
 *         description: Permission created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission created successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_ADD permission.
 */

/**
 * @openapi
 * /api/admin/v1/permission/update:
 *   put:
 *     tags: [Admin Permission]
 *     summary: Update a permission
 *     description: Requires permission PERMISSION.PERMISSION_EDIT.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [_id, moduleId, modulePermission, moduleDisplayPermission]
 *             properties:
 *               _id:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ae"
 *               moduleId:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789ad"
 *               modulePermission:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 70
 *                 example: SUBADMIN.ADMIN_ADD
 *               moduleDisplayPermission:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 70
 *                 example: Add Sub Admin
 *     responses:
 *       200:
 *         description: Permission updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission updated successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_EDIT permission.
 *       404:
 *         description: Permission not found.
 */

/**
 * @openapi
 * /api/admin/v1/permission/get:
 *   get:
 *     tags: [Admin Permission]
 *     summary: List permissions
 *     description: Paginated, searchable list of permissions (with parent module info). Requires permission PERMISSION.PERMISSION_VIEW.
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
 *         description: Case-insensitive match against modulePermission or moduleDisplayPermission.
 *     responses:
 *       200:
 *         description: Permission list fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     getData:
 *                       type: array
 *                       items: { type: object }
 *                     count: { type: integer, example: 40 }
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_VIEW permission.
 */

/**
 * @openapi
 * /api/admin/v1/permission/getAll:
 *   get:
 *     tags: [Admin Permission]
 *     summary: Get all permissions grouped by module
 *     description: >
 *       Returns every (non-deleted) module with its nested permissions, unpaginated —
 *       used to populate role-permission pickers. Requires permission PERMISSION.PERMISSION_VIEW.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permissions fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission fetched successfully }
 *                 data:
 *                   type: array
 *                   items: { type: object }
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_VIEW permission.
 */

/**
 * @openapi
 * /api/admin/v1/permission/delete:
 *   delete:
 *     tags: [Admin Permission]
 *     summary: Delete (soft-delete) a permission
 *     description: Requires permission PERMISSION.PERMISSION_DELETE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ae"
 *     responses:
 *       200:
 *         description: Permission deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission deleted successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_DELETE permission.
 *       404:
 *         description: Permission not found.
 */

/**
 * @openapi
 * /api/admin/v1/permission/status:
 *   get:
 *     tags: [Admin Permission]
 *     summary: Toggle a permission's active/inactive status
 *     description: Flips status between active and inactive. Requires permission PERMISSION.PERMISSION_STATUS_CHANGE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789ae"
 *     responses:
 *       200:
 *         description: Permission status changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Permission status changed successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing PERMISSION.PERMISSION_STATUS_CHANGE permission.
 *       404:
 *         description: Permission not found.
 */

// ===================== ROLE =====================

/**
 * @openapi
 * /api/admin/v1/role/add:
 *   post:
 *     tags: [Admin Role]
 *     summary: Create a role
 *     description: >
 *       Creates a role with an attached set of permissions. Requires permission
 *       ROLE.ROLE_ADD, restricted to the Super Admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [permissionIds]
 *             properties:
 *               roleName:
 *                 type: string
 *                 enum: [SUPER_ADMIN, OPERATIONS_ADMIN, COMPLIANCE_OFFICER, CREDIT_COMMITTEE, SUPPORT_AGENT, AUDITOR]
 *                 example: OPERATIONS_ADMIN
 *               permissionIds:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   pattern: '^[a-fA-F0-9]{24}$'
 *                 example: ["6871c7d4c2b9b123456789ae", "6871c7d4c2b9b123456789af"]
 *     responses:
 *       200:
 *         description: Role created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Role created successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing ROLE.ROLE_ADD permission (Super Admin only).
 */

/**
 * @openapi
 * /api/admin/v1/role/update:
 *   put:
 *     tags: [Admin Role]
 *     summary: Update a role
 *     description: >
 *       Requires permission ROLE.ROLE_EDIT, restricted to the Super Admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [_id, permissionIds]
 *             properties:
 *               _id:
 *                 type: string
 *                 pattern: '^[a-fA-F0-9]{24}$'
 *                 example: "6871c7d4c2b9b123456789b0"
 *               roleName:
 *                 type: string
 *                 enum: [SUPER_ADMIN, OPERATIONS_ADMIN, COMPLIANCE_OFFICER, CREDIT_COMMITTEE, SUPPORT_AGENT, AUDITOR]
 *                 example: OPERATIONS_ADMIN
 *               permissionIds:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   pattern: '^[a-fA-F0-9]{24}$'
 *                 example: ["6871c7d4c2b9b123456789ae", "6871c7d4c2b9b123456789af"]
 *     responses:
 *       200:
 *         description: Role updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Role updated successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing ROLE.ROLE_EDIT permission (Super Admin only).
 *       404:
 *         description: Role not found.
 */

/**
 * @openapi
 * /api/admin/v1/role/get:
 *   get:
 *     tags: [Admin Role]
 *     summary: List roles
 *     description: Paginated, searchable list of roles with their attached permissions. Requires permission ROLE.ROLE_VIEW.
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
 *         description: Case-insensitive match against roleName.
 *     responses:
 *       200:
 *         description: Role list fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Role fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     getData:
 *                       type: array
 *                       items: { type: object }
 *                     count: { type: integer, example: 6 }
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing ROLE.ROLE_VIEW permission.
 */

/**
 * @openapi
 * /api/admin/v1/role/delete:
 *   delete:
 *     tags: [Admin Role]
 *     summary: Delete (soft-delete) a role
 *     description: >
 *       Requires permission ROLE.ROLE_DELETE, restricted to the Super Admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789b0"
 *     responses:
 *       200:
 *         description: Role deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Role deleted successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing ROLE.ROLE_DELETE permission (Super Admin only).
 *       404:
 *         description: Role not found.
 */

/**
 * @openapi
 * /api/admin/v1/role/status:
 *   get:
 *     tags: [Admin Role]
 *     summary: Toggle a role's active/inactive status
 *     description: >
 *       Flips status between active and inactive. Requires permission
 *       ROLE.ROLE_STATUS_CHANGE, restricted to the Super Admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: _id
 *         required: true
 *         schema: { type: string, pattern: '^[a-fA-F0-9]{24}$' }
 *         example: "6871c7d4c2b9b123456789b0"
 *     responses:
 *       200:
 *         description: Role status changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string, example: Role status changed successfully }
 *                 data: { nullable: true, example: null }
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized / 2FA not verified.
 *       403:
 *         description: Forbidden — missing ROLE.ROLE_STATUS_CHANGE permission (Super Admin only).
 *       404:
 *         description: Role not found.
 */
