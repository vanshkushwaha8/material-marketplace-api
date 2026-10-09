// Every environment variable the backend reads, in one place. Only variables
// that live code actually uses are listed here — see backend/.env.example
// for what each one does. Defaults below are the behaviour when unset.
const configEnv = {
  // ── Server ──
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5200,
  SHOW_ERROR_DETAILS: String(process.env.SHOW_ERROR_DETAILS || '').toLowerCase() === 'true',

  // ── Database ──
  MONGODB_URL: process.env.MONGODB_URL,
  MONGODB_NAME: process.env.MONGODB_NAME,

  // ── URLs / CORS ──
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  BACKEND_URL: process.env.BACKEND_URL || '',
  BACKEND_URL_RESEND: process.env.BACKEND_URL_RESEND || '',
  // Public site origin used for sitemap <loc> URLs (falls back to FRONTEND_URL).
  SITE_URL: process.env.SITE_URL || '',
  CORS_ORIGINS: process.env.CORS_ORIGINS,

  // ── Auth / session ──
  SECRET_KEY: process.env.SECRET_KEY,
  COST_FACTOR: Number(process.env.COST_FACTOR) || 12,
  AUTH_COOKIE_NAME: process.env.AUTH_COOKIE_NAME || 'accessToken',
  ADMIN_AUTH_COOKIE_NAME: process.env.ADMIN_AUTH_COOKIE_NAME || 'adminAccessToken',
  AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE || 'lax',
  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE !== undefined
    ? String(process.env.AUTH_COOKIE_SECURE).toLowerCase() === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',
  AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN || '',

  // ── Two-factor authentication ──
  TOTP_ISSUER: process.env.TOTP_ISSUER || '',
  TOTP_SECRET_PEPPER: process.env.TOTP_SECRET_PEPPER || '',
  PENDING_TOKEN_SECRET: process.env.PENDING_TOKEN_SECRET || '',
  PENDING_TOKEN_TTL_S: process.env.PENDING_TOKEN_TTL_S || '',

  // ── Super-admin seed (created on first start if missing) ──
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || 'Super Admin',

  // ── Email (SMTP) ── SMTP_SERVICE is the SMTP HOST (e.g. smtp.gmail.com).
  SMTP_SERVICE: process.env.SMTP_SERVICE || '',
  SMTP_PORT: process.env.SMTP_PORT || '',
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',

  // ── Google Sign-In ── OAuth client ID (type "Web application"). Unset =
  // Google login disabled.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  // ── Buyer payments (Razorpay) ──
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || '',
  PAYMENT_KEY_ID: process.env.PAYMENT_KEY_ID || '',
  PAYMENT_KEY_SECRET: process.env.PAYMENT_KEY_SECRET || '',
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || '',
  // Dev/QA-only simulated payment; always false in production.
  ENABLE_MANUAL_PAYMENT_TEST: String(process.env.ENABLE_MANUAL_PAYMENT_TEST || '').toLowerCase() === 'true'
    && (process.env.NODE_ENV || 'development') !== 'production',

  // ── Seller payouts (RazorpayX) ──
  PAYOUT_PROVIDER: process.env.PAYOUT_PROVIDER || '',
  PAYOUT_ACCOUNT_NUMBER: process.env.PAYOUT_ACCOUNT_NUMBER || '',
  // Optional: secret of a separate RazorpayX webhook for payout.* events.
  PAYOUT_WEBHOOK_SECRET: process.env.PAYOUT_WEBHOOK_SECRET || '',
  PAYMENT_PROCESSING_FEE_PCT: process.env.PAYMENT_PROCESSING_FEE_PCT || '0',

  // ── Marketplace rules ──
  // Default commission until an admin sets a rate per seller type.
  MARKETPLACE_COMMISSION_PCT: process.env.MARKETPLACE_COMMISSION_PCT || '8.9',
  // Buyer-side convenience fee, % of the final product price, added on top
  // at payment (platform revenue — never part of the seller's settlement).
  BUYER_FEE_PCT_STORE: process.env.BUYER_FEE_PCT_STORE || '2',
  BUYER_FEE_PCT_INDIVIDUAL: process.env.BUYER_FEE_PCT_INDIVIDUAL || '3',
  // Delivery rate card used until an admin saves one (Admin → Delivery
  // rates): charge = base + perKm × distance + perKg × total weight.
  DELIVERY_BASE_CHARGE: process.env.DELIVERY_BASE_CHARGE || '50',
  DELIVERY_PER_KM: process.env.DELIVERY_PER_KM || '10',
  DELIVERY_PER_KG: process.env.DELIVERY_PER_KG || '0.5',
  DELIVERY_MAX_KM: process.env.DELIVERY_MAX_KM || '50',
  // Seller-quoted delivery (delivery.constants.js): hours the seller has to
  // quote, hours the buyer has to accept + pay, and a ₹ cap on a quote.
  DELIVERY_SELLER_QUOTE_SLA_HOURS: process.env.DELIVERY_SELLER_QUOTE_SLA_HOURS || '24',
  DELIVERY_BUYER_QUOTE_WINDOW_HOURS: process.env.DELIVERY_BUYER_QUOTE_WINDOW_HOURS || '24',
  DELIVERY_MAX_CHARGE: process.env.DELIVERY_MAX_CHARGE || '500000',
  RESERVATION_EXPIRY_HOURS: process.env.RESERVATION_EXPIRY_HOURS || '48',
  ADMIN_HIGH_VALUE_DEAL_INR: process.env.ADMIN_HIGH_VALUE_DEAL_INR || '500000',

  // ── Push notifications (Firebase Admin SDK) ──
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

  // ── Redis read cache (optional; unset = disabled) ──
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || 'bm:',

  // ── Housekeeping ──
  TEMP_UPLOAD_MAX_AGE_HOURS: process.env.TEMP_UPLOAD_MAX_AGE_HOURS || '',
  AUDIT_EXPORT_DIR: process.env.AUDIT_EXPORT_DIR || 'storage/auditLogExports',
  AUDIT_EXPORT_BATCH_SIZE: process.env.AUDIT_EXPORT_BATCH_SIZE || '',
  AUDIT_EXPORT_MAX_CONCURRENT_JOBS: process.env.AUDIT_EXPORT_MAX_CONCURRENT_JOBS || '',
  AUDIT_EXPORT_FILE_RETENTION_HOURS: process.env.AUDIT_EXPORT_FILE_RETENTION_HOURS || '',
  AUDIT_EXPORT_ACTOR_PRELOAD_MAX: process.env.AUDIT_EXPORT_ACTOR_PRELOAD_MAX || '',
  AUDIT_EXPORT_CLEANUP_INTERVAL_MS: process.env.AUDIT_EXPORT_CLEANUP_INTERVAL_MS || '',
};

module.exports = configEnv;
