const configenv = require("../config/env.config");
const HTML_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
const renderPage = ({
    icon,
    iconColor,
    title,
    message,
    showResend,
    showContinue,
    userId,
    redirectUrl,
    nonce,
}) => {
    const safeIcon = escapeHtml(icon);
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    return `<!DOCTYPE html>
                <html>
                <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>${safeTitle}</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .card {
                    background: #fff;
                    padding: 48px 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.15);
                    text-align: center;
                    max-width: 420px;
                    width: 90%;
                    }
                    .icon {
                    font-size: 56px;
                    margin-bottom: 8px;
                    color: ${iconColor};
                    }
                    h1 {
                    font-size: 22px;
                    color: #1f2937;
                    margin: 8px 0;
                    }
                    p {
                    color: #6b7280;
                    font-size: 15px;
                    line-height: 1.5;
                    margin-bottom: 28px;
                    }
                    .btn {
                    display: inline-block;
                    width: 100%;
                    padding: 13px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-bottom: 12px;
                    transition: transform 0.15s ease, opacity 0.15s ease;
                    text-decoration: none;
                    }
                    .btn:hover { transform: translateY(-1px); opacity: 0.92; }
                    .btn-primary {
                    background: #4f46e5;
                    color: #fff;
                    }
                    .btn-secondary {
                    background: #f3f4f6;
                    color: #374151;
                    border: 1px solid #e5e7eb;
                    }
                    .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                    }
                    #resendMsg {
                    margin-top: 4px;
                    font-size: 13px;
                    color: #059669;
                    min-height: 18px;
                    }
                </style>
                </head>
                <body>
                <div class="card">
                    <div class="icon">${safeIcon}</div>
                    <h1>${safeTitle}</h1>
                    <p>${safeMessage}</p>

                    ${showContinue ? `<a class="btn btn-primary" href="${redirectUrl}">Continue</a>` : ""}

                    ${showResend ? `
                    <button class="btn btn-secondary" id="resendBtn">Resend Verification Link</button>
                    <div id="resendMsg"></div>
                    ` : ""}
                </div>

                ${showResend ? `
                <script${nonce ? ` nonce="${nonce}"` : ""}>
                    async function resendLink() {
                    const btn = document.getElementById('resendBtn');
                    const msg = document.getElementById('resendMsg');
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                    try {
                        const res = await fetch('${configenv.BACKEND_URL_RESEND}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: ${JSON.stringify(userId)} })
                        });
                        const data = await res.json();
                        if (res.ok) {
                        msg.style.color = '#059669';
                        msg.textContent = 'Verification email sent successfully!';
                        btn.textContent = 'Link Sent ✔';
                        } else {
                        msg.style.color = '#dc2626';
                        msg.textContent = data?.message || 'Could not resend link. Try again later.';
                        btn.disabled = false;
                        btn.textContent = 'Resend Verification Link';
                        }
                    } catch (e) {
                        msg.style.color = '#dc2626';
                        msg.textContent = 'Network error. Please try again.';
                        btn.disabled = false;
                        btn.textContent = 'Resend Verification Link';
                    }
                    }
                    // Bound here instead of via an inline onclick attribute:
                    // CSP's script-src-attr directive blocks inline event
                    // handler attributes outright, with no hash exception
                    // available for them (only 'unsafe-inline'/nonce/'unsafe-hashes').
                    document.getElementById('resendBtn').addEventListener('click', resendLink);
                </script>
                ` : ""}
                </body>
                </html>`;
};
module.exports = { renderPage, escapeHtml };