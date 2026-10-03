const BRAND = require('../../config/brand.config');
const { verificationCodeEmail } = require('../../templates/accountEmails');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const TwofaModel = require('../../model/twofa.model');
const configenv = require('../../config/env.config');
const sendEmail = require('../../helper/sendVerificationEmail');
const PEPPER = configenv.TOTP_SECRET_PEPPER || 'CHANGE_ME_32_CHARS__________________';
const ALGO = 'aes-256-gcm';
const KEY = crypto.scryptSync(PEPPER, 'totp-salt', 32);

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptSecret(stored) {
  const [ivHex, tagHex, ctHex] = stored.split(':');
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(ctHex, 'hex')) + decipher.final('utf8');
}
function generatePlainRecoveryCode() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${seg()}-${seg()}-${seg()}`;
}
async function hashRecoveryCode(plain) { return bcrypt.hash(plain, 12); }
async function verifyRecoveryCode(plain, hash) { return bcrypt.compare(plain, hash); }
function issuePendingToken(userId) {
  const secret = configenv.PENDING_TOKEN_SECRET || 'pending_secret_change_me';
  const ttl = parseInt(configenv.PENDING_TOKEN_TTL_S || '300', 10);
  return jwt.sign({ sub: userId.toString(), type: 'mfa_pending' }, secret, { expiresIn: ttl });
}
function verifyPendingToken(token) {
  const secret = configenv.PENDING_TOKEN_SECRET || 'pending_secret_change_me';
  return jwt.verify(token, secret);
}
async function sendEmailOtp(email, otp) {
  const subject = `Your ${BRAND.NAME} verification code`;
  const html = verificationCodeEmail({ otp });
  await sendEmail(email, subject, html);
}
const twofaService = {};
twofaService.provisionTotp = async (user) => {
  const issuer = configenv.TOTP_ISSUER || BRAND.NAME; // label shown in authenticator apps
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${user.email})`,
    issuer: issuer,
    length: 20,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  return {
    qrCodeDataUrl,
    manualKey: secret.base32,
    tempSecret: secret.base32,
  };
};

twofaService.verifyTotpSetup = async (userId, tempSecret, token) => {
  const valid = speakeasy.totp.verify({
    secret: tempSecret,
    encoding: 'base32',
    token: token.replace(/\s/g, ''),
    window: 1,
  });
  if (!valid) {
    throw Object.assign(new Error('Invalid TOTP code. Please try again.'), { statusCode: 400 });
  }
  const plainCodes = Array.from({ length: 10 }, generatePlainRecoveryCode);
  const hashedCodes = await Promise.all(
    plainCodes.map(async (c) => ({ codeHash: await hashRecoveryCode(c), usedAt: null }))
  );
  await TwofaModel.findOneAndUpdate(
    { userId },
    {
      totpSecret: encryptSecret(tempSecret),
      totpVerified: true,
      activeMethod: 'totp',
      recoveryCodes: hashedCodes,
      recoveryAcknowledgedAt: null,
    },
    { upsert: true, new: true }
  );
  return { recoveryCodes: plainCodes};
};

twofaService.acknowledgeRecoveryCodes = async (userId, userModel) => {
  const now = new Date();
  await TwofaModel.findOneAndUpdate({ userId }, { recoveryAcknowledgedAt: now });
  await userModel.findByIdAndUpdate(userId, { mfaEnabled: true });
  return { acknowledgedAt: now };
};

twofaService.initiateEmailSetup = async (userId, email, otpModel) => {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expireOn = new Date(Date.now() + 10 * 60 * 1000);
  const otpHash = await bcrypt.hash(otp, 12);

  await otpModel.deleteMany({ userId });
  await otpModel.create({ userId, otp: otpHash, expireOn });
  await sendEmailOtp(email, otp);

  return { message: 'A verification code has been sent to ' + email };
};

twofaService.verifyEmailSetup = async (userId, email, otpCode, otpModel) => {
  const record = await otpModel.findOne({ userId }).sort({ createdAt: -1 });
  const otpValid = record && (await bcrypt.compare(otpCode, record.otp));
  if (!record || !otpValid || new Date() > record.expireOn) {
    throw Object.assign(new Error('Invalid or expired OTP.'), { statusCode: 400 });
  }
  await otpModel.deleteMany({ userId });
  const plainCodes = Array.from({ length: 10 }, generatePlainRecoveryCode);
  const hashedCodes = await Promise.all(
    plainCodes.map(async (c) => ({ codeHash: await hashRecoveryCode(c), usedAt: null }))
  );
  await TwofaModel.findOneAndUpdate(
    { userId },
    {
      emailFallbackEnabled: true,
      fallbackEmail: email,
      activeMethod: 'email',
      recoveryCodes: hashedCodes,
      recoveryAcknowledgedAt: null,
    },
    { upsert: true, new: true }
  );

  return { recoveryCodes: plainCodes };
};

twofaService.switchMethod = async (userId, newMethod) => {
  if (!['totp', 'email'].includes(newMethod)) {
    throw Object.assign(new Error('Invalid method.'), { statusCode: 400 });
  }
  const doc = await TwofaModel.findOne({ userId });
  if (!doc) throw Object.assign(new Error('2FA not enrolled.'), { statusCode: 400 });
  if (newMethod === 'totp' && !doc.totpVerified) {
    throw Object.assign(new Error('TOTP not yet set up.'), { statusCode: 400 });
  }
  if (newMethod === 'email' && !doc.emailFallbackEnabled) {
    throw Object.assign(new Error('Email fallback not yet set up.'), { statusCode: 400 });
  }
  await TwofaModel.findOneAndUpdate({ userId }, { activeMethod: newMethod });
  return { activeMethod: newMethod };
};

twofaService.issuePendingLogin = async (userId) => {
  const token = issuePendingToken(userId);
  const expiry = new Date(Date.now() + parseInt(configenv.PENDING_TOKEN_TTL_S || '300', 10) * 1000);
  await TwofaModel.findOneAndUpdate(
    { userId },
    { pendingToken: token, pendingTokenExpiry: expiry }
  );
  return token;
};

twofaService.verifyLoginFactor = async (pendingToken, otpCode, otpModel) => {
  let payload;
  try {
    payload = verifyPendingToken(pendingToken);
  } catch {
    throw Object.assign(new Error('Session expired. Please log in again.'), { statusCode: 401 });
  }
  const userId = payload.sub;
  const doc = await TwofaModel.findOne({ userId });
  if (!doc || doc.pendingToken !== pendingToken) {
    throw Object.assign(new Error('Invalid session.'), { statusCode: 401 });
  }
  if (new Date() > doc.pendingTokenExpiry) {
    throw Object.assign(new Error('2FA window expired. Please log in again.'), { statusCode: 401 });
  }
  if (doc.activeMethod === 'totp') {
    const plain = decryptSecret(doc.totpSecret);
    const valid = speakeasy.totp.verify({
      secret: plain,
      encoding: 'base32',
      token: otpCode.replace(/\s/g, ''),
      window: 1,
    });
    if (!valid) throw Object.assign(new Error('Invalid authenticator code.'), { statusCode: 400 });
  } else {
    const record = await otpModel.findOne({ userId }).sort({ createdAt: -1 });
    const otpValid = record && (await bcrypt.compare(otpCode, record.otp));
    if (!record || !otpValid || new Date() > record.expireOn) {
      throw Object.assign(new Error('Invalid or expired email code.'), { statusCode: 400 });
    }
    await otpModel.deleteMany({ userId });
  }

  await TwofaModel.findOneAndUpdate(
    { userId },
    { pendingToken: null, pendingTokenExpiry: null }
  );

  return userId;
};

twofaService.verifyLoginWithRecoveryCode = async (pendingToken, plainCode) => {
  let payload;
  try {
    payload = verifyPendingToken(pendingToken);
  } catch {
    throw Object.assign(new Error('Session expired. Please log in again.'), { statusCode: 401 });
  }

  const userId = payload.sub;
  const doc = await TwofaModel.findOne({ userId });

  if (!doc || doc.pendingToken !== pendingToken) {
    throw Object.assign(new Error('Invalid session.'), { statusCode: 401 });
  }
  const unusedCodes = doc.recoveryCodes.filter((c) => c.usedAt === null);
  let matchIndex = -1;
  for (let i = 0; i < unusedCodes.length; i++) {
    if (await verifyRecoveryCode(plainCode.trim(), unusedCodes[i].codeHash)) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex === -1) {
    throw Object.assign(new Error('Invalid recovery code.'), { statusCode: 400 });
  }

  const originalIndex = doc.recoveryCodes.findIndex(
    (c) => c.codeHash === unusedCodes[matchIndex].codeHash
  );
  doc.recoveryCodes[originalIndex].usedAt = new Date();
  doc.pendingToken = null;
  doc.pendingTokenExpiry = null;
  await doc.save();

  return userId;
};
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; 
twofaService.sendLoginEmailOtp = async (userId, otpModel) => {
  const doc = await TwofaModel.findOne({ userId });
  if (!doc || !doc.fallbackEmail) {
    throw Object.assign(new Error('Email fallback 2FA not configured.'), { statusCode: 400 });
  }
  const existing = await otpModel.findOne({ userId }).sort({ createdAt: -1 });
  if (existing) {
    const msSinceLastSend = Date.now() - existing.createdAt.getTime();
    if (msSinceLastSend < OTP_RESEND_COOLDOWN_MS) {
      const secondsRemaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - msSinceLastSend) / 1000);
      throw Object.assign(
        new Error(`Please wait ${secondsRemaining} second(s) before requesting another code.`),
        { statusCode: 429 }
      );
    }
  }
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expireOn = new Date(Date.now() + 10 * 60 * 1000);
  const otpHash = await bcrypt.hash(otp, 12);
  await otpModel.deleteMany({ userId });
  await otpModel.create({ userId, otp: otpHash, expireOn });
  await sendEmailOtp(doc.fallbackEmail, otp);
  return { message: 'A verification code has been sent to your email.' };
};

twofaService.regenerateRecoveryCodes = async (userId, otpCode, otpModel) => {
  const doc = await TwofaModel.findOne({ userId });
  if (!doc) throw Object.assign(new Error('2FA not enrolled.'), { statusCode: 400 });

  await verifyAccountFactor(doc, userId, otpCode, otpModel);

  const plainCodes = Array.from({ length: 10 }, generatePlainRecoveryCode);
  const hashedCodes = await Promise.all(
    plainCodes.map(async (c) => ({ codeHash: await hashRecoveryCode(c), usedAt: null }))
  );

  await TwofaModel.findOneAndUpdate(
    { userId },
    { recoveryCodes: hashedCodes, recoveryAcknowledgedAt: null }
  );

  return { recoveryCodes: plainCodes };
};

// `enrolled` mirrors what login actually enforces (users.mfaEnabled): a
// method verified but recovery codes never acknowledged is NOT enrolled —
// previously the page showed "2FA enabled" while login never asked for a
// code. `setupPending` lets the UI resume that unfinished setup instead.
twofaService.getStatus = async (userId, userModel) => {
  const doc = await TwofaModel.findOne({ userId });
  if (!doc) return { enrolled: false, setupPending: false, totpVerified: false, emailFallback: false, activeMethod: null, recoveryCodesLeft: 0 };
  const methodVerified = Boolean(doc.totpVerified || doc.emailFallbackEnabled);
  const user = userModel ? await userModel.findById(userId).select('mfaEnabled').lean() : null;
  const enrolled = methodVerified && Boolean(doc.recoveryAcknowledgedAt || user?.mfaEnabled);
  return {
    enrolled,
    setupPending: methodVerified && !enrolled,
    totpVerified: Boolean(doc.totpVerified),
    emailFallback: Boolean(doc.emailFallbackEnabled),
    activeMethod: doc.activeMethod,
    acknowledged: !!doc.recoveryAcknowledgedAt,
    recoveryCodesLeft: doc.recoveryCodes.filter((c) => c.usedAt === null).length,
  };
};

// Logged-in counterpart of sendLoginEmailOtp: an email-method user needs a
// fresh code to regenerate recovery codes or disable 2FA (there was no way
// to get one before — the regenerate form was unusable for them).
twofaService.sendAccountEmailCode = async (userId, otpModel) => twofaService.sendLoginEmailOtp(userId, otpModel);

// Accepts EITHER the active method's code OR an unused recovery code — so a
// user who lost their phone (but saved recovery codes) can still turn 2FA
// off. Marks the recovery code used.
async function verifyAccountFactor(doc, userId, code, otpModel) {
  const value = String(code || '').trim();
  if (/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i.test(value)) {
    const idx = await (async () => {
      for (let i = 0; i < doc.recoveryCodes.length; i += 1) {
        const c = doc.recoveryCodes[i];
        if (c.usedAt === null && await verifyRecoveryCode(value.toUpperCase(), c.codeHash)) return i;
      }
      return -1;
    })();
    if (idx === -1) throw Object.assign(new Error('Invalid recovery code.'), { statusCode: 400 });
    doc.recoveryCodes[idx].usedAt = new Date();
    await doc.save();
    return;
  }
  if (doc.activeMethod === 'totp') {
    if (!doc.totpSecret) throw Object.assign(new Error('Authenticator app is not set up.'), { statusCode: 400 });
    const valid = speakeasy.totp.verify({ secret: decryptSecret(doc.totpSecret), encoding: 'base32', token: value.replace(/\s/g, ''), window: 1 });
    if (!valid) throw Object.assign(new Error('Invalid authenticator code.'), { statusCode: 400 });
    return;
  }
  const record = await otpModel.findOne({ userId }).sort({ createdAt: -1 });
  const otpValid = record && (await bcrypt.compare(value, record.otp));
  if (!record || !otpValid || new Date() > record.expireOn) {
    throw Object.assign(new Error('Invalid or expired email code.'), { statusCode: 400 });
  }
  await otpModel.deleteMany({ userId });
}
twofaService.initiateDisable2FA = async (userId, otpModel) => {
  const doc = await TwofaModel.findOne({ userId });
  if (!doc) throw Object.assign(new Error('2FA is not enabled.'), { statusCode: 400 });
  if (doc.activeMethod === 'totp') {
    return { requiresOtp: false, method: 'totp' };
  }
  if (doc.activeMethod === 'email' && doc.fallbackEmail) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expireOn = new Date(Date.now() + 10 * 60 * 1000);
    const otpHash = await bcrypt.hash(otp, 12);

    await otpModel.deleteMany({ userId });
    await otpModel.create({ userId, otp: otpHash, expireOn });
    await sendEmailOtp(doc.fallbackEmail, otp);
    return { requiresOtp: true, method: 'email', message: 'A verification code has been sent to your email.' };
  }

  throw Object.assign(new Error('No valid 2FA method found.'), { statusCode: 400 });
};

twofaService.confirmDisable2FA = async (userId, otp, otpModel, userModel) => {
  const doc = await TwofaModel.findOne({ userId });
  if (!doc) throw Object.assign(new Error('2FA is not enabled.'), { statusCode: 400 });

  await verifyAccountFactor(doc, userId, otp, otpModel);

  await TwofaModel.deleteOne({ userId });
  await userModel.findByIdAndUpdate(userId, { mfaEnabled: false });

  return { disabled: true };
};

module.exports = twofaService;