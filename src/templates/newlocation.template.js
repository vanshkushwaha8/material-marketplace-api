const newLoginLocationTemplate = async (data = {}) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Opalus – New Login Location</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background-color: #EEF2F7;
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #0D1B2A;
    }
    .email-wrapper {
      max-width: 620px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #C8D6E8;
      box-shadow: 0 4px 24px rgba(13, 27, 66, 0.10);
    }

    /* Header */
    .header {
      background: #0D1B42;
      padding: 36px 48px 30px;
      text-align: center;
    }
    .logo-placeholder {
      display: inline-block;
      background: #ffffff;
      border-radius: 10px;
      padding: 10px 22px;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 3px;
      color: #0D1B42;
      margin-bottom: 14px;
    }
    .logo-placeholder span { color: #2563EB; }
    .tagline {
      font-size: 12px;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #7A9BC4;
    }

    /* Icon row */
    .icon-row { text-align: center; padding: 36px 48px 0; }
    .alert-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #EEF4FF;
      border: 2px solid #1D4ED8;
      font-size: 34px;
    }

    /* Body */
    .body { padding: 28px 48px 40px; text-align: center; }
    .body h1 {
      font-size: 24px;
      font-weight: bold;
      color: #0D1B42;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }
    .subtitle {
      font-size: 15px;
      color: #3A5A8E;
      line-height: 1.75;
      max-width: 440px;
      margin: 0 auto 30px;
    }

    /* Detail box */
    .detail-box {
      background: linear-gradient(135deg, #1E3A8A 0%, #0D1B42 100%);
      border-radius: 14px;
      padding: 26px 28px;
      margin: 0 auto 30px;
      max-width: 420px;
      position: relative;
      overflow: hidden;
      text-align: left;
    }
    .detail-box::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 140px; height: 140px;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
    }
    .detail-box::after {
      content: '';
      position: absolute;
      bottom: -30px; left: -20px;
      width: 100px; height: 100px;
      border-radius: 50%;
      background: rgba(37,99,235,0.10);
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      position: relative;
      z-index: 1;
      border-bottom: 1px solid rgba(255,255,255,0.10);
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-label {
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #7A9BC4;
    }
    .detail-value {
      font-size: 14px;
      color: #ffffff;
      font-family: 'Courier New', monospace;
    }

    /* Warning strip */
    .warning-strip {
      background: #F0F5FF;
      border: 1px solid #C3D4F0;
      border-left: 4px solid #1D4ED8;
      border-radius: 10px;
      padding: 14px 20px;
      max-width: 440px;
      margin: 0 auto 28px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: left;
    }
    .warning-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
    .warning-strip p { font-size: 13px; color: #2A3A5A; line-height: 1.65; }
    .warning-strip strong { color: #1D4ED8; }
    .warning-strip a { color: #1D4ED8; font-weight: bold; text-decoration: none; }

    /* Footer */
    .footer {
      background: #EEF2F7;
      border-top: 1px solid #C8D6E8;
      padding: 24px 48px;
      text-align: center;
    }
    .footer p { font-size: 12px; color: #7A90B0; line-height: 1.8; }
  </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <div class="logo-placeholder">OPAL<span>U</span>S</div>
            <p class="tagline">Investment Platform</p>
        </div>

        <div class="icon-row">
            <div class="alert-wrap">📍</div>
        </div>

        <div class="body">
            <h1>New Login Location</h1>
            <p class="subtitle">
                Hi <strong>${data?.name || "there"}</strong>, we noticed your account was
                accessed from a new location or network. If this was you, no action is needed.
            </p>

            <div class="detail-box">
                <div class="detail-row">
                    <span class="detail-label">IP Address</span>
                    <span class="detail-value">${data?.ipAddress || "Unknown"}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time</span>
                    <span class="detail-value">${data?.time || new Date().toLocaleString()}</span>
                </div>
            </div>

            <div class="warning-strip">
                <div class="warning-icon">⚠️</div>
                <p>
                    <strong>Didn't recognize this?</strong> Your account may be at risk.
                    Change your password immediately and review your active sessions.
                    If you need help, <a href="mailto:security@opalus.com">contact support</a>.
                </p>
            </div>
        </div>

        <div class="footer">
            <p>© 2026 Opalus. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
};

module.exports = { newLoginLocationTemplate };