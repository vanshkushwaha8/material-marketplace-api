/**
 * AC1/FR-037 enforcement: Opalus issuers must be legal persons registered
 * under the approved v1 template (French Project Company) only. Trusts,
 * unit trusts, funds and partnerships are explicitly excluded. The
 * registration form used to offer "Trust" as a live, selectable entity
 * type, and the backend validation accepted it — both fixed here.
 *
 * These tests only check the entityType-specific Joi error, independent
 * of whatever other fields are missing from the payload — Joi's
 * abortEarly:false reports every violation, so this stays valid even if
 * the rest of the Register() schema changes shape later.
 */

const authValidation = require("../validation/app/auth.validation");

function entityTypeError(payload) {
  const { error } = authValidation.validateRegister(payload);
  return error?.details.find((d) => d.path.includes("entityType"));
}

describe("auth.validation — entityType (AC1/FR-037: no trust issuers)", () => {
  test("rejects entityType: 'trust' for a Developer registration", () => {
    const err = entityTypeError({ userType: "Developer", entityType: "trust" });
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Company/);
  });

  test("rejects entityType: 'Trust' (capitalized) too", () => {
    const err = entityTypeError({ userType: "Developer", entityType: "Trust" });
    expect(err).toBeDefined();
  });

  test("still accepts entityType: 'Company' for a Developer registration", () => {
    const err = entityTypeError({ userType: "Developer", entityType: "Company" });
    expect(err).toBeUndefined();
  });

  test("entityType is forbidden (not applicable) for an Investor registration", () => {
    const err = entityTypeError({ userType: "Investor", entityType: "Company" });
    expect(err).toBeDefined(); // Joi "forbidden" — investors don't submit this field at all
  });
});
