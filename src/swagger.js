const swaggerJsdoc = require("swagger-jsdoc");
const configenv = require("./config/env.config");
const BRAND = require("./config/brand.config");
const options = {
    definition: {
        openapi: "3.0.0",
        info: { title: `${BRAND.NAME} API`, version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        // The API this instance actually serves (BACKEND_URL), plus local dev.
        servers: [...new Set([configenv.BACKEND_URL, `http://localhost:${configenv.PORT || 5200}`].filter(Boolean))].map((url) => ({ url })),
    },
    apis: ["./src/swagger-docs/app/**/*.js", "./src/swagger-docs/admin/**/*.js", "./src/swagger-docs/health/**/*.js", "./src/swagger-docs/upload/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;