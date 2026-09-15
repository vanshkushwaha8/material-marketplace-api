const inviteSubadmin = (data) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Opalus – Admin Invitation</title>

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: #EEF2F7;
      font-family: Georgia, "Times New Roman", serif;
      color: #0D1B42;
    }

    .email-wrapper {
      max-width: 620px;
      margin: 40px auto;
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #C8D6E8;
      box-shadow: 0 4px 24px rgba(13,27,66,.1);
    }

    .header {
      background: #0D1B42;
      padding: 36px;
      text-align: center;
    }

    .logo-placeholder {
      display: inline-block;
      background: #fff;
      padding: 10px 24px;
      border-radius: 10px;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 3px;
      color: #0D1B42;
    }

    .logo-placeholder span {
      color: #2563EB;
    }

    .banner {
      background: linear-gradient(135deg,#1E3A8A,#0D1B42);
      text-align: center;
      padding: 35px;
      color: white;
    }

    .icon {
      width: 70px;
      height: 70px;
      line-height: 70px;
      border-radius: 50%;
      margin: auto auto 16px;
      font-size: 34px;
      background: rgba(255,255,255,.15);
    }

    .banner h2 {
      margin-bottom: 8px;
    }

    .banner p {
      color: rgba(255,255,255,.8);
    }

    .body {
      padding: 40px;
    }

    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
      line-height: 1.8;
    }

    .info-card {
      background: #F4F8FF;
      border: 1px solid #D4E2F5;
      border-left: 4px solid #2563EB;
      border-radius: 10px;
      padding: 20px;
      margin: 30px 0;
    }

    .info-title {
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #2563EB;
      margin-bottom: 16px;
    }

    .info-row {
      display: flex;
      padding: 10px 0;
      border-bottom: 1px solid #E4ECF8;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .label {
      width: 120px;
      color: #6B7F98;
      font-size: 13px;
    }

    .value {
      font-weight: bold;
      color: #0D1B42;
      font-size: 14px;
    }

    .button-wrapper {
      text-align: center;
      margin: 35px 0;
    }

    .button {
      display: inline-block;
      background: #2563EB;
      color: white !important;
      text-decoration: none;
      padding: 16px 42px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 15px;
    }

    .note {
      margin-top: 15px;
      font-size: 12px;
      color: #7A8FA6;
    }

    .support {
      margin-top: 35px;
      background: #F8FAFD;
      border: 1px solid #D9E4F3;
      border-radius: 10px;
      padding: 20px;
    }

    .support h3 {
      margin-bottom: 12px;
      color: #0D1B42;
      font-size: 16px;
    }

    .support p {
      font-size: 14px;
      color: #4B5F7A;
      line-height: 1.8;
    }

    .footer {
      background: #EEF2F7;
      border-top: 1px solid #D6E1EF;
      padding: 30px;
      text-align: center;
    }

    .footer p {
      font-size: 12px;
      color: #7A90B0;
      line-height: 1.8;
    }

    .footer a {
      color: #2563EB;
      word-break: break-all;
    }
  </style>

</head>

<body>

<div class="email-wrapper">

    <div class="header">
        <div class="logo-placeholder">
            OPA<span>L</span>US
        </div>
    </div>

    <div class="banner">

        <div class="icon">
            👤
        </div>

        <h2>You're Invited!</h2>

        <p>
            Welcome to the Opalus Admin Console.
            Complete your account setup to access the platform.
        </p>

    </div>

    <div class="body">

        <p class="greeting">
            Hello <strong>${data.name}</strong>,
        </p>

        <p class="greeting">
            You have been invited by a <strong>Super Administrator</strong>
            to access the <strong>Opalus Admin Console</strong>.
        </p>

        <div class="info-card">

            <div class="info-title">
                Invitation Details
            </div>

            <div class="info-row">
                <div class="label">Name</div>
                <div class="value">${data.name}</div>
            </div>

            <div class="info-row">
                <div class="label">Email</div>
                <div class="value">${data.email}</div>
            </div>

            <div class="info-row">
                <div class="label">Assigned Role</div>
                <div class="value">${data.roleName}</div>
            </div>

            <div class="info-row">
                <div class="label">Status</div>
                <div class="value">Invitation Pending</div>
            </div>

        </div>

        <div class="button-wrapper">

            <a href="${data.inviteUrl}" class="button">
                Create Password
            </a>

            <div class="note">
                This invitation expires in <strong>24 hours</strong>.
            </div>

        </div>

        <div class="support">

            <h3>What happens next?</h3>

            <p>

                • Click <strong>Create Password</strong>.<br><br>

                • Choose a secure password for your administrator account.<br><br>

                • Complete Two-Factor Authentication (2FA).<br><br>

                • After setup, you can securely sign in to the Opalus Admin Console.

            </p>

        </div>

        <div class="support" style="margin-top:20px;">

            <h3>Didn't expect this invitation?</h3>

            <p>

                If you were not expecting this invitation,
                you can safely ignore this email.

                If you have questions, please contact your
                platform administrator.

            </p>

        </div>

    </div>

    <div class="footer">

        <p>

            If the button above doesn't work, copy and paste the following link into your browser.

            <br><br>

            <a href="${data.inviteUrl}">
                ${data.inviteUrl}
            </a>

            <br><br>

            © 2026 Opalus. All rights reserved.

        </p>

    </div>

</div>

</body>
</html>`
}
module.exports = inviteSubadmin;