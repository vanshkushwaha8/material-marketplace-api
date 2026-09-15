/**
 * @openapi
 * tags:
 *   - name: Upload
 *     description: >
 *       Generic file-upload endpoints used ahead of KYC document saves and profile-image
 *       updates. Accepts images (jpeg/png/jpg/gif/webp/avif) or PDFs, 1KB–50MB.
 */

/**
 * @openapi
 * /api/upload/singleImage:
 *   post:
 *     tags: [Upload]
 *     summary: Upload a single file
 *     description: >
 *       Multipart field name must be `tempImage`. Accepts either a normal JWT Bearer token,
 *       or — for the KYC mobile hand-off flow — a `Bearer relay:<relayToken>` header in
 *       place of a login session, validated against an active mobile-relay record.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tempImage]
 *             properties:
 *               tempImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: string
 *                   description: >
 *                     The generated server filename itself — NOT an object. Use this exact
 *                     string as the `serverFile` value in subsequent KYC document /
 *                     progress-step-complete / profile-update calls.
 *                   example: "1753000000000___passport_front.webp"
 *       400:
 *         description: No file provided, more than one file provided, or file failed validation (type/size).
 *       500:
 *         description: Internal server error during upload processing.
 */

/**
 * @openapi
 * /api/upload/multiImage:
 *   post:
 *     tags: [Upload]
 *     summary: Upload multiple files at once
 *     description: Multipart field name must be `tempImage`, sent multiple times (array).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [tempImage]
 *             properties:
 *               tempImage:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   description: One generated server filename string per uploaded file, in the same order.
 *                   items:
 *                     type: string
 *                     example: "1753000000000___id_back.webp"
 *       400:
 *         description: No files provided, or one or more files failed validation (type/size).
 *       500:
 *         description: Internal server error during upload processing.
 */
