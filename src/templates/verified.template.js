 const verifyTemplate = (data) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Opalus – Email Verification</title>
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
    .verified-banner {
      background: linear-gradient(135deg, #1E3A8A 0%, #0D1B42 100%);
      padding: 28px 48px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .verified-banner::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 140px; height: 140px;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
    }
    .verified-banner::after {
      content: '';
      position: absolute;
      bottom: -30px; left: -20px;
      width: 100px; height: 100px;
      border-radius: 50%;
      background: rgba(37,99,235,0.08);
    }
    .check-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.35);
      font-size: 30px;
      margin-bottom: 14px;
      position: relative;
      z-index: 1;
    }
    .verified-banner h2 {
      font-size: 22px;
      font-weight: bold;
      color: #ffffff;
      letter-spacing: 0.5px;
      position: relative;
      z-index: 1;
      margin-bottom: 6px;
    }
    .verified-banner p {
      font-size: 13.5px;
      color: rgba(255,255,255,0.70);
      position: relative;
      z-index: 1;
    }
    .verify-btn-wrapper {
      text-align: center;
    }
    .verify-btn {
      display: inline-block;
      background: #1D4ED8;
      color: #ffffff;
      text-decoration: none;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.8px;
      padding: 16px 44px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .verify-btn:hover { background: #1E40AF; }
    .verify-note {
      font-size: 12px;
      color: #7A8FA6;
      margin-top: 10px;
    }
    .body {
      padding: 34px 48px 40px;
    }
 
    .greeting {
      font-size: 16px;
      color: #2A3A52;
      line-height: 1.75;
      margin-bottom: 22px;
    }
 
    .greeting strong {
      color: #0D1B42;
      font-size: 17px;
    }
 
    /* ── Info Card ── */
    .info-card {
      background: #F0F5FF;
      border: 1px solid #C3D4F0;
      border-left: 4px solid #1D4ED8;
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 28px;
    }
 
    .info-card-title {
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #1D4ED8;
      margin-bottom: 12px;
      font-weight: bold;
    }
 
    .info-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 0;
      border-bottom: 1px solid #D1E0F5;
    }
 
    .info-row:last-child { border-bottom: none; }
 
    .info-label {
      font-size: 12px;
      color: #5A7A9E;
      letter-spacing: 0.5px;
      width: 110px;
      flex-shrink: 0;
    }
 
    .info-value {
      font-size: 13.5px;
      color: #0D1B42;
      font-weight: bold;
    }
 
    /* ── Section Title ── */
    .section-title {
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #1D4ED8;
      margin-bottom: 14px;
      font-weight: bold;
    }
 
    /* ── Action Buttons ── */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 28px;
    }
 
    .action-btn {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border-radius: 10px;
      text-decoration: none;
      border: 1px solid transparent;
      transition: opacity 0.2s;
    }
 
    .action-btn .btn-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
    }
 
    .action-btn .btn-text strong {
      display: block;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 2px;
    }
 
    .action-btn .btn-text span { font-size: 12.5px; }
 
    .action-btn .btn-arrow {
      margin-left: auto;
      font-size: 18px;
      flex-shrink: 0;
    }
 
    .btn-fleet {
      background: #0D1B42;
      border-color: #1E3460;
      color: #ffffff;
    }
 
    .btn-fleet .btn-icon { background: rgba(37,99,235,0.25); }
    .btn-fleet .btn-text span { color: #7A9BC4; }
    .btn-fleet .btn-arrow { color: #2563EB; }
 
    .btn-driver {
      background: #EEF4FF;
      border-color: #BFCFEE;
      color: #0D1B42;
    }
 
    .btn-driver .btn-icon { background: #1D4ED8; }
    .btn-driver .btn-text strong { color: #0D1B42; }
    .btn-driver .btn-text span { color: #3A5A8E; }
    .btn-driver .btn-arrow { color: #1D4ED8; }
 
    .btn-dashboard {
      background: #ffffff;
      border-color: #1D4ED8;
      color: #0D1B42;
    }
 
    .btn-dashboard .btn-icon { background: #EEF4FF; }
    .btn-dashboard .btn-text strong { color: #0D1B42; }
    .btn-dashboard .btn-text span { color: #3A5A8E; }
    .btn-dashboard .btn-arrow { color: #1D4ED8; }
 
    /* ── Divider ── */
    .divider {
      border: none;
      border-top: 1px solid #E4EAF5;
      margin: 28px 0;
    }
 
    /* ── Support Box ── */
    .support-box {
      background: #F4F7FC;
      border: 1px solid #C8D6E8;
      border-radius: 10px;
      padding: 18px 22px;
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
 
    .support-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
 
    .support-box p {
      font-size: 13.5px;
      color: #2A3A5A;
      line-height: 1.7;
    }
 
    .support-box a {
      color: #1D4ED8;
      text-decoration: none;
      font-weight: bold;
    }
 
    /* ── Footer ── */
    .footer {
      background: #EEF2F7;
      border-top: 1px solid #C8D6E8;
      padding: 24px 48px;
      text-align: center;
    }
 
    .footer p {
      font-size: 12px;
      color: #7A90B0;
      line-height: 1.8;
    }
 
    .footer a { color: #3A6AAE; text-decoration: none; }
 
    .social-links {
      margin-top: 10px;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
 
    .social-links a {
      font-size: 12px;
      color: #4A70B0;
      text-decoration: none;
      letter-spacing: 0.8px;
    }
  </style>
</head>
<body>
 
  <div class="email-wrapper">
    <div class="header">
      <div class="logo-placeholder">OPA<span>L</span>US</div>
    </div>
    <div class="verified-banner">
      <div class="check-circle">✉️</div>
      <h2>Verify Your Email Address</h2>
      <p>Please confirm your email to activate your Opalus account.</p>
    </div>
    <div class="body">
      <div class="verify-btn-wrapper">
        <a href="${data?.verifyUrl}" class="verify-btn">✔ Verify My Email</a>
        <p class="verify-note">This link expires in 24 hours. Do not share it with anyone.</p>
      </div>
    </div>
    <div class="footer">
      <p>
        © 2025 Opalus Logistics Platform. All rights reserved.<br/>
        <a href="#">Unsubscribe</a> · <a href="#">Privacy Policy</a> · <a href="#">Terms of Service</a>
      </p>
      <div class="social-links">
        <a href="#">Twitter</a>
        <a href="#">LinkedIn</a>
        <a href="#">Facebook</a>
      </div>
    </div>
  </div>
</body>
</html>`
};
module.exports=verifyTemplate