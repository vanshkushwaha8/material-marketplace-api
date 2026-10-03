/**
 * @openapi
 * /api/v1/material-categories/summary:
 *   get:
 *     tags: [Material Categories]
 *     summary: Active categories with live-listing stats (landing page)
 *     description: >
 *       For each active category: `listingCount` (LIVE listings), `sellerCount` (distinct sellers),
 *       the lowest listed `minPrice` with its `minPriceUnit`, and an `imageUrl` from one of its
 *       listings. Categories without live listings return 0 / null. Stats are cached for up to
 *       two minutes.
 *     security: []
 *     responses:
 *       200:
 *         description: Array of { _id, name, slug, parentCategory, logoUrl, listingCount, sellerCount, minPrice, minPriceUnit, imageUrl }.
 */
