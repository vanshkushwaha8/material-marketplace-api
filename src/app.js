const loggerInfo = require('./logger/info.logger');
const dns = require("node:dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);
loggerInfo.info("Node DNS Servers:", dns.getServers());

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const os = require('os');
const configenv = require("./config/env.config");
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const mongooseConnection = require('./config/db');

const userRouter = require('./routes/app/index');
const adminRouter = require('./routes/admin/index');
const imageRouter = require('./routes/upload/upload.route');

const swaggerUiDist = require("swagger-ui-dist");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const cron = require("node-cron");
const {
  sweepOrphanedTempUploads,
} = require("./service/upload/tempUploadCleanup.service");

const errorHandler = require('./middleware/errorHandler.middleware');
const requestIdMiddleware = require('./middleware/requestId.middleware');

const {
  isFirebaseConfigured,
} = require('./config/firebase.config');

const PORT = process.env.PORT || configenv.PORT || 8000;

const allowedOrigins =
  configenv.CORS_ORIGINS?.split(',') || [];

const isEmailVerificationRoute = (req) =>
  req.path === "/api/v1/emailVerification" ||
  req.path === "/api/v1/emailVerification/";


// ---------------------------------------------------------
// Firebase Push Notification Startup Check
// ---------------------------------------------------------
if (!isFirebaseConfigured()) {
  console.log(
    '[PUSH] Firebase Cloud Messaging: DISABLED ' +
    '(no/invalid FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) ' +
    '— notifications will still be created and shown in-app, ' +
    'but no device push will be sent.'
  );
}


const setupApp = () => {
  const app = express();

  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(cookieParser());

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  if (allowedOrigins.length === 0) {
    loggerInfo.info(
      "[CORS] WARNING: CORS_ORIGINS is not set — no cross-origin browser " +
      "requests (including your own frontend) will be allowed to send " +
      "credentials/cookies. Set CORS_ORIGINS to your frontend's exact origin."
    );
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  const imagePaths = [
    "../public/tempUploads",
    "../public/profile",
    "../public/adminProfile",
    "../public/images",
    "../public/projectDocuments",
    "../public/kycDocuments",
    "../public/investmentDocuments",
    "../public/documents",
    "../public/admin",
    "../public/cms",
    "../public/materialListingMedia",
  ];

  imagePaths.forEach((p) => {
    app.use(
      "/images",
      express.static(path.join(__dirname, p))
    );
  });

  app.use((req, res, next) => {
    res.locals.cspNonce =
      crypto.randomBytes(16).toString('base64');

    next();
  });

  const secureHeaders = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) =>
            `'nonce-${res.locals.cspNonce}'`,
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },

    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  app.use((req, res, next) => {
    if (isEmailVerificationRoute(req)) {
      return next();
    }

    secureHeaders(req, res, next);
  });

  app.use(mongoSanitize());
  app.use(xss());
  app.use(hpp());

  app.use(
    express.urlencoded({
      extended: true,
      limit: "50mb",
    })
  );

  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(
    "/api/upload",
    fileUpload(),
    imageRouter
  );

  app.use("/api/v1", userRouter);

  app.use("/api/admin/v1", adminRouter);

  app.use(
    "/api/v1/admin",
    (req, res) => {
      return res.status(403).json({
        status: false,
        message: "Access denied.",
      });
    }
  );

  app.use(
    "/api-docs-assets",
    express.static(
      swaggerUiDist.getAbsoluteFSPath()
    )
  );

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCssUrl:
        "/api-docs-assets/swagger-ui.css",

      customJs: [
        "/api-docs-assets/swagger-ui-bundle.js",
        "/api-docs-assets/swagger-ui-standalone-preset.js",
      ],
    })
  );

  app.use((_req, res) => {
    res.status(404).json({
      status: false,
      message:
        "This endpoint does not exist. Please provide a valid endpoint.",
    });
  });

  app.use(errorHandler);

  return app;
};


const app = setupApp();


const startServer = async () => {
  try {
    if (configenv.NODE_ENV !== "test") {
      await mongooseConnection();

      app.listen(PORT, () => {
        loggerInfo.info(
          `Server running on port number:${PORT}`
        );

        // NOTE: KIIS defect-deadline sweep removed —
        // investment-domain-only.

        if (
          configenv.AUDIT_EXPORT_CLEANUP_INTERVAL_MS
        ) {
          const {
            cleanupExpiredExports,
          } = require(
            './service/admin/auditLog/auditLogBulkExport.service'
          );

          setInterval(() => {
            cleanupExpiredExports().catch((err) => {
              console.error(
                'Audit log export cleanup sweep failed:',
                err.message
              );
            });
          }, Number(
            configenv.AUDIT_EXPORT_CLEANUP_INTERVAL_MS
          ));
        }


        const {
          expireStaleOffers,
        } = require('./service/app/offer.service');

        const {
          expireStaleReservations,
        } = require('./service/app/transaction.service');


        cron.schedule(
          "*/15 * * * *",
          async () => {
            try {
              const offerResult =
                await expireStaleOffers();

              const reservationResult =
                await expireStaleReservations();

              console.log(
                `Offer expiry sweep — offers: ${offerResult.modified}, reservations released: ${reservationResult.released}`
              );
            } catch (err) {
              console.error(
                "Offer/reservation expiry sweep failed:",
                err
              );
            }
          }
        );


        // NOTE: SLA-escalation job removed along
        // with withdrawal/recon-exception money-ops modules.


        /*****************************
         * delete temp upload cleanup
         *****************************/

        cron.schedule(
          "0 0 */2 * *",
          async () => {
            try {
              console.log(
                "Running temp upload cleanup..."
              );

              const result =
                await sweepOrphanedTempUploads();

              console.log(
                `Scanned: ${result.scanned}, Deleted: ${result.deleted}, Freed: ${(result.deletedBytes / 1024 / 1024).toFixed(2)} MB`
              );
            } catch (err) {
              console.error(
                "Temp upload cleanup failed:",
                err
              );
            }
          }
        );
      });
    }
  } catch (error) {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
};


startServer();