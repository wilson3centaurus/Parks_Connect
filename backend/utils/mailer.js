import nodemailer from 'nodemailer';

let transporterPromise;

async function createTransporter() {
  const provider = String(process.env.EMAIL_PROVIDER || 'console').trim().toLowerCase();

  if (provider === 'console' || provider === 'test') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (provider === 'smtp') {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || 'false') === 'true',
      auth: process.env.EMAIL_USER
        ? {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS || ''
          }
        : undefined
    });
  }

  return nodemailer.createTransport({ jsonTransport: true });
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter();
  }
  return transporterPromise;
}

export async function sendAlertEmail({ to, subject, text }) {
  if (!to) return { skipped: true };

  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'parksconnect@localhost',
    to,
    subject,
    text
  });

  if (String(process.env.EMAIL_PROVIDER || 'console').trim().toLowerCase() === 'console') {
    console.log('Alert email payload:', JSON.stringify(info.message || info, null, 2));
  }

  return info;
}
