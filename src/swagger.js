const swaggerJsdoc = require("swagger-jsdoc");
const options = {
    definition: {
        openapi: "3.0.0",
        info: { title: "Opalus API", version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        servers: [{ url: "http://localhost:8000" }, { url: "http://192.168.0.145:8000" }, { url: "https://opalusapi.etrueconcept.com" }],
    },
    apis: ["./src/swagger-docs/app/**/*.js", "./src/swagger-docs/admin/**/*.js", "./src/swagger-docs/health/**/*.js", "./src/swagger-docs/upload/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;