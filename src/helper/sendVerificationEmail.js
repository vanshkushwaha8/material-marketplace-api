const nodemailer = require("nodemailer");
const configenv = require("../config/env.config");
const BRAND = require("../config/brand.config");

const transporter = nodemailer.createTransport({
    host: configenv.SMTP_SERVICE,
    port: Number(configenv.SMTP_PORT),
    secure: false,
    auth: {
        user: configenv.EMAIL_USER,
        pass: configenv.EMAIL_PASS,
    },
    logger: false,
    debug: false,
    tls: {
        rejectUnauthorized: false,
    },
});

const sendEmail = async (email, title, body) => {
    try {
      
        const html = String(body || "");
        const info = await transporter.sendMail({
            // Display name = the platform, not the bare SMTP mailbox.
            from: { name: BRAND.NAME, address: configenv.EMAIL_USER },
            to: email,
            subject: title,
            html,
            encoding: "base64",
            // Brand logo embedded inline for the shared email layout.
            attachments: html.includes(`cid:${BRAND.LOGO_CID}`)
                ? [{ filename: "logo.png", path: BRAND.LOGO_FILE, cid: BRAND.LOGO_CID }]
                : [],
        });

        return info;

    } catch (error) {
        console.error(error);
        console.error(error.stack);
        throw error;
    }
};

module.exports = sendEmail;