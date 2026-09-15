const mongoose = require("mongoose");
const configenv = require("../src/config/env.config");
const seedRoles = require("../src/seed/role.seed");

const run = async () => {
    try {
        console.log("⏳ Connecting to database...");

        await mongoose.connect(configenv.MONGODB_URL, {
            dbName: configenv.MONGODB_NAME
        });

        console.log(`✅ DB connected successfully (${configenv.MONGODB_NAME})`);

        await seedRoles();

        console.log("✅ Seeding complete. Exiting...");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
};

run();