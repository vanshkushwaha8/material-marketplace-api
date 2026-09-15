const nodemailer = require("nodemailer");
const configenv = require("../config/env.config");

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
      
        const info = await transporter.sendMail({
            from: configenv.EMAIL_USER,
            to: email,
            subject: title,
            html: body,
            encoding: "base64",
        });

        return info;

    } catch (error) {
        console.error(error);
        console.error(error.stack);
        throw error;
    }
};

module.exports = sendEmail;