const configenv = require("../config/env.config");
const cookieOptions = () => ({
    httpOnly: true,
    secure: configenv.AUTH_COOKIE_SECURE,
    sameSite: configenv.AUTH_COOKIE_SAMESITE,
    ...(configenv.AUTH_COOKIE_DOMAIN ? { domain: configenv.AUTH_COOKIE_DOMAIN } : {}),
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 24h — matches the JWT's own expiry (helper.generateTokken default)
});

function setAuthCookie(response, token, options = {}) {
    if (!token) return;
    const cookieName = options.cookieName || configenv.AUTH_COOKIE_NAME;
    const { cookieName: _drop, ...cookieOpts } = options;
    response.cookie(cookieName, token, { ...cookieOptions(), ...cookieOpts });
}

function clearAuthCookie(response, cookieName = configenv.AUTH_COOKIE_NAME) {
    const { maxAge, ...opts } = cookieOptions();
    response.cookie(cookieName, '', { ...opts, expires: new Date(0) });
}

function setAdminAuthCookie(response, token, options = {}) {
    setAuthCookie(response, token, { cookieName: configenv.ADMIN_AUTH_COOKIE_NAME, ...options });
}

function clearAdminAuthCookie(response) {
    clearAuthCookie(response, configenv.ADMIN_AUTH_COOKIE_NAME);
}

module.exports = { setAuthCookie, clearAuthCookie, setAdminAuthCookie, clearAdminAuthCookie };
