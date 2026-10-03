// /material-categories/summary — live-listing stats merged onto the active
// category list (landing page tiles, chips, Best Value Materials).
jest.mock("../helper/cache.helper", () => ({
  NAMESPACES: { CATEGORIES: "categories", CATEGORY_STATS: "category-stats" },
  getOrSet: (_ns, _id, _ttl, loader) => loader(),
}));
jest.mock("../model/materialCategory.model", () => ({ find: jest.fn() }));
jest.mock("../model/materialListing.model", () => ({ aggregate: jest.fn() }));

const materialCategoryModel = require("../model/materialCategory.model");
const materialListingModel = require("../model/materialListing.model");
const service = require("../service/app/materialCategory.service");

const chain = (rows) => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) });

describe("materialCategory.service.summary", () => {
  beforeEach(() => jest.clearAllMocks());

  test("merges live stats onto every active category; categories without listings get zeros", async () => {
    materialCategoryModel.find.mockReturnValue(chain([
      { _id: "c1", name: "Bricks", slug: "bricks", logo: "", parentCategory: null, specFields: [{ key: "secret" }] },
      { _id: "c2", name: "Pipes", slug: "pipes", logo: "pipes.png" },
    ]));
    materialListingModel.aggregate.mockResolvedValue([
      { _id: "c1", listingCount: 3, sellerCount: 2, minPrice: 8, minPriceUnit: "piece", imageUrl: "/images/b.jpg" },
    ]);
    const data = await service.summary();
    expect(data).toEqual([
      { _id: "c1", name: "Bricks", slug: "bricks", parentCategory: null, logoUrl: "", listingCount: 3, sellerCount: 2, minPrice: 8, minPriceUnit: "piece", imageUrl: "/images/b.jpg" },
      { _id: "c2", name: "Pipes", slug: "pipes", parentCategory: null, logoUrl: "/images/pipes.png", listingCount: 0, sellerCount: 0, minPrice: null, minPriceUnit: null, imageUrl: "" },
    ]);
    // public fields only — no admin-side spec definitions etc.
    expect(JSON.stringify(data)).not.toContain("specFields");
  });

  test("aggregates LIVE, non-deleted listings only, cheapest first", async () => {
    materialCategoryModel.find.mockReturnValue(chain([]));
    materialListingModel.aggregate.mockResolvedValue([]);
    await service.summary();
    const [pipeline] = materialListingModel.aggregate.mock.calls[0];
    expect(pipeline[0]).toEqual({ $match: { status: "LIVE", is_deleted: "0" } });
    expect(pipeline[1]).toEqual({ $sort: { price: 1, createdAt: -1 } });
    expect(pipeline[2].$group).toEqual(expect.objectContaining({ _id: "$category", minPrice: { $first: "$price" }, minPriceUnit: { $first: "$unit" } }));
  });
});
