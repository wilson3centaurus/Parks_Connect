const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT || 587),
  secure: Number(process.env.EMAIL_PORT || 587) === 465,
  tls: {
    rejectUnauthorized: process.env.EMAIL_ALLOW_SELF_SIGNED !== 'true'
  },
  auth: process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    : undefined
});

function buildFromAddress() {
  const fromName = String(process.env.EMAIL_FROM_NAME || 'ZimParks').trim();
  const fromEmail = String(process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || '').trim();

  if (!fromEmail) {
    return '';
  }

  return fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
}

async function sendMail({ to, subject, text, html }) {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(`Email delivery skipped for ${to}: mailer credentials are not configured.`);
    return false;
  }

  await transporter.sendMail({
    from: buildFromAddress(),
    to,
    subject,
    text,
    html
  });

  return true;
}

module.exports = {
  transporter,
  sendMail
};
