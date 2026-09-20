const admin = require('firebase-admin'); // npm install firebase-admin
const configenv = require('./env.config');

let messaging = null;

function isFirebaseConfigured() {
  return !!(configenv.FIREBASE_PROJECT_ID && configenv.FIREBASE_CLIENT_EMAIL && configenv.FIREBASE_PRIVATE_KEY);
}

// Same "sandbox/disabled mode with a clear startup log" pattern this
// project already uses for Sumsub/KIIS — never crash the app over a
// missing push-notification credential.
function getMessaging() {
  if (!isFirebaseConfigured()) return null;
  if (!messaging) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: configenv.FIREBASE_PROJECT_ID,
        clientEmail: configenv.FIREBASE_CLIENT_EMAIL,
        privateKey: configenv.FIREBASE_PRIVATE_KEY,
      }),
    });
    messaging = admin.messaging();
  }
  return messaging;
}

module.exports = { getMessaging, isFirebaseConfigured };