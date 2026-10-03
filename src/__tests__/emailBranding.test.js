// Every email the platform sends must carry the current brand (never the old
// "Opalus" template text) and show the invited admin's actual role.
const fs = require("fs");
const path = require("path");
const BRAND = require("../config/brand.config");
const inviteSubadmin = require("../templates/InviteAdmin");
const verifyTemplate = require("../templates/verified.template");
const { newLoginLocationTemplate } = require("../templates/newlocation.template");
const { passwordResetEmail, passwordChangedEmail, verificationCodeEmail } = require("../templates/accountEmails");

const render = async () => ({
  invite: await inviteSubadmin({ name: "Priya", email: "priya@example.com", roleName: "Finance", inviteUrl: "https://example.com/accept?t=1" }),
  verify: await verifyTemplate({ verifyUrl: "https://example.com/verify?t=1" }),
  newLocation: await newLoginLocationTemplate({ name: "Priya", ipAddress: "::ffff:10.0.0.1" }),
  reset: passwordResetEmail({ resetUrl: "https://example.com/reset?t=1", validFor: "15 minutes" }),
  changed: passwordChangedEmail({ name: "Priya" }),
  otp: verificationCodeEmail({ otp: "123456" }),
});

describe("email branding", () => {
  test("every template uses the brand name and inline logo, never Opalus", async () => {
    const emails = await render();
    for (const [name, html] of Object.entries(emails)) {
      expect({ name, opalus: /opalus/i.test(html) }).toEqual({ name, opalus: false });
      expect(html).toContain(BRAND.NAME);
      expect(html).toContain(`cid:${BRAND.LOGO_CID}`);
    }
  });

  test("the admin invite shows the assigned role, escaped", async () => {
    const html = await inviteSubadmin({ name: "Priya", email: "p@example.com", roleName: "Finance <Ops>", inviteUrl: "https://example.com/a" });
    expect(html).toContain("Finance &lt;Ops&gt;");
    expect(html).not.toContain("Finance <Ops>");
  });

  test("the embedded logo file ships with the backend", () => {
    expect(fs.existsSync(BRAND.LOGO_FILE)).toBe(true);
  });

  test("no backend source file mentions Opalus", () => {
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|json|html)$/.test(entry.name) && full !== __filename && /opalus/i.test(fs.readFileSync(full, "utf8"))) hits.push(full);
      }
    };
    walk(path.join(__dirname, ".."));
    expect(hits).toEqual([]);
  });
});
