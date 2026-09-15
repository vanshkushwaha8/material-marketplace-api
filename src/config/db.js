const mongoose = require("mongoose");
const adminModel = require("../model/admin.model");
const helper = require("../helper/helper");
const logger = require("../logger/error.logger");
const configenv = require("./env.config")
const loggerInfo = require("../logger/info.logger");
const userConsentModel = require("../model/userconsent.model");
const userModel = require("../model/user.model");
require('dotenv').config();
const url = configenv.MONGODB_URL + configenv.MONGODB_NAME;
const dbName = configenv.MONGODB_NAME;
const connectDB = async () => {
    try {
        loggerInfo.info("Connecting to MongoDB", url);
        await mongoose.connect(url);
        loggerInfo.info("Mongo Connected Successfully");
        try {
            await userConsentModel.syncIndexes();
            loggerInfo.info("userConsent indexes synced");
        } catch (indexError) {
            logger.error("Failed to sync userConsent indexes:", indexError);
        }
        try {
            await userModel.syncIndexes();
            loggerInfo.info("user indexes synced");
        } catch (indexError) {
            logger.error(
                "Failed to sync user indexes — likely a pre-existing duplicate/case-variant email needs manual resolution:",
                indexError
            );
        }
        const alreadyExist = await adminModel.findOne({
            type: "admin",
            isSuperAdmin: true
        });
        if (!alreadyExist) {
            const hashedPassword = await helper.createPassword(configenv.ADMIN_PASSWORD);
            const admin = new adminModel({
                fullName: configenv.SUPER_ADMIN_NAME,
                email: configenv.ADMIN_EMAIL,
                type: "admin",
                password: hashedPassword,
                isSuperAdmin: true,
                isPasswordSet:true
            });
            await admin.save();
        }
        loggerInfo.info("connectDB finished");
    } catch (error) {
        logger.error("Error connecting to MongoDB:", error);
    }
};
module.exports = connectDB;
