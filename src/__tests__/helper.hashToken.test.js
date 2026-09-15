/**
 * Regression tests for N-01: email verification links arriving with a
 * stray/corrupted whitespace around the token (e.g. from MIME quoted-
 * printable line-folding) must still hash-match, and a non-string/missing
 * token must throw a clear, typed error rather than a confusing one.
 */

jest.mock("bcrypt", () => ({}), { virtual: true });
jest.mock("jsonwebtoken", () => ({}), { virtual: true });
jest.mock("otp-generator", () => ({}), { virtual: true });
jest.mock("fs-jetpack", () => ({}), { virtual: true });
jest.mock("pdfkit", () => function PDFDocument() {}, { virtual: true });
jest.mock("../model/session.model", () => ({}));

const helper = require("../helper/helper");

describe("helper.hashToken", () => {
  test("trims stray leading/trailing whitespace before hashing, so a token that arrived with incidental whitespace still matches the stored hash", () => {
    const clean = helper.hashToken("abc123");
    const withLeadingSpace = helper.hashToken("  abc123");
    const withTrailingNewline = helper.hashToken("abc123\n");
    const withBoth = helper.hashToken("\t abc123 \n");

    expect(withLeadingSpace).toBe(clean);
    expect(withTrailingNewline).toBe(clean);
    expect(withBoth).toBe(clean);
  });

  test("different tokens still hash to different values (trimming doesn't cause collisions)", () => {
    expect(helper.hashToken("abc123")).not.toBe(helper.hashToken("abc124"));
  });

  test("throws a clear TypeError for undefined instead of silently hashing a placeholder string", () => {
    expect(() => helper.hashToken(undefined)).toThrow(TypeError);
  });

  test("throws a clear TypeError for a non-string (e.g. object) instead of coercing it", () => {
    expect(() => helper.hashToken({ evil: true })).toThrow(TypeError);
  });
});