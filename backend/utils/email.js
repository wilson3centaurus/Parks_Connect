import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

const FROM = `"${process.env.EMAIL_FROM_NAME || 'Parks Connect'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`;

// ── Shared layout wrapper ────────────────────────────────────────────────────
function wrap(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Parks Connect — ZimParks</title>
</head>
<body style="margin:0;padding:0;background:#f0f7f4;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;padding:32px 16px;">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="background:linear-gradient(135deg,#0d3d28,#1D9E75);padding:40px 40px 32px;text-align:center;">
        <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:28px;line-height:64px;">🌿</div>
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Parks Connect</h1>
        <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.08em;text-transform:uppercase;">Zimbabwe Parks &amp; Wildlife Management Authority</p>
      </td>
    </tr>

    <!-- Body -->
    <tr><td style="padding:36px 40px;">${bodyHtml}</td></tr>

    <!-- Ice cream footer decoration -->
    <tr>
      <td style="background:#f8fffe;padding:24px 40px;border-top:1px solid #e8f5ef;text-align:center;">
        <p style="margin:0 0 8px;font-size:22px;">🍦🌿🦁🍦</p>
        <p style="margin:0;font-size:12px;color:#9cbbaa;">This is an automated message from Parks Connect.<br>For support contact your system administrator.</p>
        <p style="margin:8px 0 0;font-size:11px;color:#b8cfc5;">&copy; ${new Date().getFullYear()} Zimbabwe Parks &amp; Wildlife Management Authority</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Welcome / account creation email ────────────────────────────────────────
export async function sendWelcomeEmail({ to, name, email, idNumber, role, parkName }) {
  const roleLabels = {
    authority_admin: 'Authority Administrator',
    environment_officer: 'Environment Officer',
    tourism_operator: 'Tourism / Reception Staff'
  };
  const roleLabel = roleLabels[role] || role;
  const defaultPassword = idNumber ? idNumber.replace(/\s+/g, '').toLowerCase() : '(contact admin)';

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d3d28;">Welcome to Parks Connect! 🌍</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#4a7a62;line-height:1.6;">Hi <strong>${name}</strong>, your staff account has been created on the Zimbabwe National Parks management system.</p>

    <!-- Info card -->
    <div style="background:#f0f9f4;border:1px solid #c3e6d3;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Login Email</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${email}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Role</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${roleLabel}</td></tr>
        ${parkName ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Assigned Park</td></tr><tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${parkName}</td></tr>` : ''}
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">National ID Number</td></tr>
        <tr><td style="padding:0 0 0;font-size:16px;font-weight:700;color:#0d3d28;">${idNumber || '—'}</td></tr>
      </table>
    </div>

    <!-- Password highlight -->
    <div style="background:linear-gradient(135deg,#1D9E75,#0d7a5a);border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.8);font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Your Default Password</p>
      <p style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:2px;font-family:monospace;">${defaultPassword}</p>
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">Your ID number — without spaces — all letters lowercase</p>
    </div>

    <div style="background:#fff8e1;border:1px solid #ffd54f;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#7a6000;">🔐 <strong>Important:</strong> You will be prompted to change your password on first login. Please change it immediately after signing in for the first time.</p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#4a7a62;line-height:1.6;">To access the system, visit the Parks Connect staff portal and log in with your email address and the password above.</p>

    <div style="text-align:center;margin-top:8px;">
      <a href="${process.env.WEB_URL || 'http://localhost:3000'}/login" style="display:inline-block;padding:14px 36px;background:#1D9E75;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">Access Staff Portal →</a>
    </div>
  `;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Your Parks Connect Staff Account — ${name}`,
    html: wrap(body)
  });
}

// ── Visit booking notification to park officer ───────────────────────────────
export async function sendVisitBookingNotification({ officerEmail, officerName, parkName, visitorName, visitorEmail, visitDate, visitorCount, notes }) {
  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d3d28;">New Visit Request 🗓️</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#4a7a62;line-height:1.6;">Hi <strong>${officerName}</strong>, a visitor has submitted a visit request for <strong>${parkName}</strong>.</p>

    <div style="background:#f0f9f4;border:1px solid #c3e6d3;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Visitor Name</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${visitorName}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Visitor Email</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${visitorEmail || 'Not provided'}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Preferred Visit Date</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${visitDate || 'Flexible'}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Group Size</td></tr>
        <tr><td style="padding:0 0 16px;font-size:16px;font-weight:700;color:#0d3d28;">${visitorCount || 1} visitor(s)</td></tr>
        ${notes ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b9e84;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Notes</td></tr><tr><td style="padding:0;font-size:14px;color:#0d3d28;">${notes}</td></tr>` : ''}
      </table>
    </div>

    <p style="margin:0;font-size:14px;color:#4a7a62;line-height:1.6;">Please review this request in the Parks Connect dashboard and reach out to the visitor to confirm arrangements.</p>
  `;

  await transporter.sendMail({
    from: FROM,
    to: officerEmail,
    subject: `Visit Request for ${parkName} — ${visitorName}`,
    html: wrap(body)
  });
}

// ── Generic send helper ──────────────────────────────────────────────────────
export async function sendMail({ to, subject, html }) {
  await transporter.sendMail({ from: FROM, to, subject, html: wrap(html) });
}

export default transporter;
