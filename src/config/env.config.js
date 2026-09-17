const configEnv = {
  MONGODB_URL: process.env.MONGODB_URL,
  MONGODB_NAME: process.env.MONGODB_NAME,
  PORT: process.env.PORT || 5200,
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || '',
  AI_SERVICE_TIMEOUT_MS:
    Number(process.env.AI_SERVICE_TIMEOUT_MS) || 300000,
  AI_SERVICE_KEY: process.env.AI_SERVICE_KEY || '',
  SERVER_PUBLIC_URL: (process.env.SERVER_PUBLIC_URL || '').replace(/\/+$/, ''),
  SECRET_KEY: process.env.SECRET_KEY,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SHOW_ERROR_DETAILS: String(process.env.SHOW_ERROR_DETAILS || '').toLowerCase() === 'true',
  AUTH_COOKIE_NAME: process.env.AUTH_COOKIE_NAME || 'accessToken',
  ADMIN_AUTH_COOKIE_NAME: process.env.ADMIN_AUTH_COOKIE_NAME || 'adminAccessToken',
  AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE || 'lax',
  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE !== undefined
    ? String(process.env.AUTH_COOKIE_SECURE).toLowerCase() === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',
  AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  SUMSUB_APP_TOKEN: process.env.SUMSUB_APP_TOKEN,
  SUMSUB_SECRET_KEY: process.env.SUMSUB_SECRET_KEY,
  SUMSUB_LEVEL_NAME: process.env.SUMSUB_LEVEL_NAME,
  SUMSUB_LEVEL_SEC: process.env.SUMSUB_LEVEL_SEC,
  SUMSUB_WEBHOOK_SECRET: process.env.SUMSUB_WEBHOOK_SECRET,
  SUMSUB_LEVEL_AMF: process.env.SUMSUB_LEVEL_AMF,
  SUMSUB_LEVEL_ASIC: process.env.SUMSUB_LEVEL_ASIC,
  SUMSUB_BASE_URL: process.env.SUMSUB_BASE_URL,
  SUMSUB_ENABLED: String(process.env.SUMSUB_ENABLED || '').toLowerCase() === 'true'
    && !!process.env.SUMSUB_APP_TOKEN
    && !!process.env.SUMSUB_SECRET_KEY,

  // KIIS regulator (Bank of Lithuania) review — not a real integration yet,
  // no such API exists to point this at today. These exist so the shape is
  // ready: once real credentials/endpoint are available, set them and
  // BANK_REGULATOR_ENABLED flips on automatically — nothing else in
  // kiisRegulatorReview.service.js needs to change, same as SUMSUB_ENABLED
  // above.
  BANK_REGULATOR_API_BASE_URL: process.env.BANK_REGULATOR_API_BASE_URL || '',
  BANK_REGULATOR_API_KEY: process.env.BANK_REGULATOR_API_KEY || '',
  BANK_REGULATOR_WEBHOOK_SECRET: process.env.BANK_REGULATOR_WEBHOOK_SECRET || '',
  BANK_REGULATOR_ENABLED: String(process.env.BANK_REGULATOR_ENABLED || '').toLowerCase() === 'true'
    && !!process.env.BANK_REGULATOR_API_BASE_URL
    && !!process.env.BANK_REGULATOR_API_KEY,

  KYC_SUPPORTED_COUNTRIES: process.env.KYC_SUPPORTED_COUNTRIES || '',
  KYC_KNOWLEDGE_TEST_PASS_THRESHOLD: Number(process.env.KYC_KNOWLEDGE_TEST_PASS_THRESHOLD) || 70,
  KYC_KNOWLEDGE_TEST_VALIDITY_MONTHS: Number(process.env.KYC_KNOWLEDGE_TEST_VALIDITY_MONTHS) || 24,
  KYC_KNOWLEDGE_TEST_QUESTION_COUNT: Number(process.env.KYC_KNOWLEDGE_TEST_QUESTION_COUNT) || 5,
  KYC_LOSS_SIM_VALIDITY_MONTHS: Number(process.env.KYC_LOSS_SIM_VALIDITY_MONTHS) || 12,
  KYC_SOPHISTICATION_VALIDITY_MONTHS: Number(process.env.KYC_SOPHISTICATION_VALIDITY_MONTHS) || 24,
  KYC_QUESTION_BANK_VERSION: process.env.KYC_QUESTION_BANK_VERSION || 'v1',
  KYC_DOCUMENT_MAX_SIZE_MB: Number(process.env.KYC_DOCUMENT_MAX_SIZE_MB) || 15,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SUPER_ADMIN_NAME: process.env.SUPER_ADMIN_NAME || 'Super Admin',
  SALT_NUMBER: process.env.SALT_NUMBER,
  ALLOWED_IMAGE_DOMAINS: process.env.ALLOWED_IMAGE_DOMAINS || '',
  ALLOWED_CONNECT_DOMAINS: process.env.ALLOWED_CONNECT_DOMAINS || '',
  SMTP_SERVICE: process.env.SMTP_SERVICE || '',
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || '',
  TOTP_ISSUER: process.env.TOTP_ISSUER || '',
  BANK_API_KEY: process.env.BANK_API_KEY || '',
  BACKEND_URL: process.env.BACKEND_URL || '',
  TOTP_SECRET_PEPPER: process.env.TOTP_SECRET_PEPPER || '',
  PENDING_TOKEN_SECRET: process.env.PENDING_TOKEN_SECRET || '',
  PENDING_TOKEN_TTL_S: process.env.PENDING_TOKEN_TTL_S || '',
  SMTP_PORT: process.env.SMTP_PORT || '',
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  BACKEND_URL_RESEND: process.env.BACKEND_URL_RESEND || '',
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  AWS_REGION: process.env.AWS_REGION || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_PUBLIC_BASE_URL: process.env.AWS_S3_PUBLIC_BASE_URL || '',
  VIRUS_SCAN_PROVIDER: process.env.VIRUS_SCAN_PROVIDER || 'none',
  CLAMAV_HOST: process.env.CLAMAV_HOST || '',
  CLAMAV_PORT: process.env.CLAMAV_PORT || '',
  CLAMAV_TIMEOUT_MS: process.env.CLAMAV_TIMEOUT_MS || '',
  PROJECT_LISTING_FEE_EUR: process.env.PROJECT_LISTING_FEE_EUR || '',
  PROJECT_SUCCESS_FEE_PCT: process.env.PROJECT_SUCCESS_FEE_PCT || '',
  PROJECT_DISTRIBUTION_ADMIN_FEE_EUR: process.env.PROJECT_DISTRIBUTION_ADMIN_FEE_EUR || '',
  PROJECT_ARCHIVE_RESTORE_WINDOW_DAYS: process.env.PROJECT_ARCHIVE_RESTORE_WINDOW_DAYS || '',
  KIIS_DEFECT_REMEDIATION_DAYS: process.env.KIIS_DEFECT_REMEDIATION_DAYS || '',
  PROJECT_IMAGE_MAX_COUNT: process.env.PROJECT_IMAGE_MAX_COUNT || '',
  PROJECT_IMAGE_MAX_SIZE_MB: process.env.PROJECT_IMAGE_MAX_SIZE_MB || '',
  MARKETPLACE_COMMISSION_PCT: process.env.MARKETPLACE_COMMISSION_PCT || '8.9',
  PROJECT_DOCUMENT_MAX_SIZE_MB: process.env.PROJECT_DOCUMENT_MAX_SIZE_MB || '',
  KIIS_MAX_PAGES: process.env.KIIS_MAX_PAGES || '',
  KIIS_DEFECT_SWEEP_INTERVAL_MS: process.env.KIIS_DEFECT_SWEEP_INTERVAL_MS || '',
  TEMP_UPLOAD_MAX_AGE_HOURS: process.env.TEMP_UPLOAD_MAX_AGE_HOURS || '',
  // Opt-in in-process fallback sweep interval (ms) — same pattern as
  // KIIS_DEFECT_SWEEP_INTERVAL_MS above; a real deployment should run
  // scripts/cleanupTempUploads.js on an external scheduler instead.
  TEMP_UPLOAD_CLEANUP_INTERVAL_MS: process.env.TEMP_UPLOAD_CLEANUP_INTERVAL_MS || '',

  // OPL-344 — bulk (unbounded) audit log export. See
  // auditLogBulkExport.service.js for how each of these is used.
  AUDIT_EXPORT_DIR: process.env.AUDIT_EXPORT_DIR || 'storage/auditLogExports',
  AUDIT_EXPORT_BATCH_SIZE: process.env.AUDIT_EXPORT_BATCH_SIZE || '',
  AUDIT_EXPORT_MAX_CONCURRENT_JOBS: process.env.AUDIT_EXPORT_MAX_CONCURRENT_JOBS || '',
  AUDIT_EXPORT_FILE_RETENTION_HOURS: process.env.AUDIT_EXPORT_FILE_RETENTION_HOURS || '',
  // Safety cap on the "preload every user+admin into memory once, then do
  // O(1) lookups for all N audit rows" fast path — see buildActorResolver.
  // Above this combined user+admin count, it falls back to a per-batch
  // $in query instead of one large preload, so this scales correctly even
  // if that assumption (small actor universe, huge audit log) ever stops
  // holding.
  AUDIT_EXPORT_ACTOR_PRELOAD_MAX: process.env.AUDIT_EXPORT_ACTOR_PRELOAD_MAX || '',
  // Opt-in in-process sweep, same convention as
  // KIIS_DEFECT_SWEEP_INTERVAL_MS / TEMP_UPLOAD_CLEANUP_INTERVAL_MS above —
  // fine for a single instance or local/staging use; a real production
  // deployment should run scripts/cleanupAuditLogExports.js on an external
  // scheduler instead, same as those two.
  AUDIT_EXPORT_CLEANUP_INTERVAL_MS: process.env.AUDIT_EXPORT_CLEANUP_INTERVAL_MS || '',

  // ── E15 — Money Operations & Financial Crime ──────────────────────────
  // PSP integration (OPL-401, OPL-402). Set PSP_ENABLED=false (default)
  // to use the manual payment-instruction fallback — see
  // adapters/psp/manual.psp.adapter.js and config/integrations.config.js.
  PSP_ENABLED: String(process.env.PSP_ENABLED || '').toLowerCase() === 'true'
    && !!process.env.PSP_API_KEY,
  PSP_PROVIDER: process.env.PSP_PROVIDER || '', // 'lemonway' | 'mangopay'
  PSP_API_URL: process.env.PSP_API_URL || '',
  PSP_API_KEY: process.env.PSP_API_KEY || '',
  PSP_WEBHOOK_SECRET: process.env.PSP_WEBHOOK_SECRET || '',
  PSP_CLIENT_ID: process.env.PSP_CLIENT_ID || '',
  PSP_LEMONWAY_VERSION: process.env.PSP_LEMONWAY_VERSION || '',
  PSP_MANGOPAY_CLIENT_ID: process.env.PSP_MANGOPAY_CLIENT_ID || '',

  // Sanctions screening (OPL-404). Same enabled-gate shape as PSP above.
  SANCTIONS_ENABLED: String(process.env.SANCTIONS_ENABLED || '').toLowerCase() === 'true'
    && !!process.env.SANCTIONS_API_KEY,
  SANCTIONS_PROVIDER: process.env.SANCTIONS_PROVIDER || '', // 'complyadvantage' | 'refinitiv'
  SANCTIONS_API_URL: process.env.SANCTIONS_API_URL || '',
  SANCTIONS_API_KEY: process.env.SANCTIONS_API_KEY || '',

  // AML rule engine thresholds (OPL-404) — internal config, no vendor required.
  AML_HIGH_VALUE_THRESHOLD_MINOR_UNITS: Number(process.env.AML_HIGH_VALUE_THRESHOLD_MINOR_UNITS) || 1000000,
  AML_VELOCITY_WINDOW_HOURS: Number(process.env.AML_VELOCITY_WINDOW_HOURS) || 24,
  AML_VELOCITY_MAX_TRANSACTIONS: Number(process.env.AML_VELOCITY_MAX_TRANSACTIONS) || 10,
  AML_HIGH_RISK_JURISDICTIONS: process.env.AML_HIGH_RISK_JURISDICTIONS || 'IR,KP,SY,CU,VE,MM',

  RECON_EXCEPTION_SLA_HOURS: Number(process.env.RECON_EXCEPTION_SLA_HOURS) || 48,
  WITHDRAWAL_HOLD_SLA_HOURS: Number(process.env.WITHDRAWAL_HOLD_SLA_HOURS) || 24,
  // Opt-in, same convention as KIIS_DEFECT_SWEEP_INTERVAL_MS — a real
  // production deployment should run these on an external scheduler
  // instead (daily for recon, hourly for SLA), not rely on a single
  // long-running process's setInterval.
  RECON_MATCH_INTERVAL_MS: process.env.RECON_MATCH_INTERVAL_MS || '',
  SLA_ESCALATION_INTERVAL_MS: process.env.SLA_ESCALATION_INTERVAL_MS || '',

  // --- Investment workflow (Stripe) -----------------------------------------
  // Secret key from your Stripe Dashboard (Developers > API keys). Required
  // for create-investment-intent to work at all; until set, that endpoint
  // returns a clear "payments not configured" error instead of the account
  // silently pretending to accept money.
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  COST_FACTOR: Number(process.env.COST_FACTOR) || 12,
};

module.exports = configEnv;
if (require.main !== module) {
  console.log(
    configEnv.SUMSUB_ENABLED
      ? `[KYC] Sumsub identity verification: ENABLED (base ${configEnv.SUMSUB_BASE_URL})`
      : '[KYC] Sumsub identity verification: SANDBOX MODE (no/invalid SUMSUB_APP_TOKEN + SUMSUB_SECRET_KEY, or SUMSUB_ENABLED=false) — the identity step will show "Simulate approved/rejected" instead of the real Sumsub SDK.'
  );
  console.log(
    configEnv.BANK_REGULATOR_ENABLED
      ? `[KIIS] Bank regulator review: ENABLED (base ${configEnv.BANK_REGULATOR_API_BASE_URL})`
      : '[KIIS] Bank regulator review: SANDBOX MODE (no real regulator API configured) — admin "Submit for regulator review" will show a simulator instead of calling a live endpoint.'
  );
}
