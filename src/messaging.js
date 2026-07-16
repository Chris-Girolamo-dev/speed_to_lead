const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { config, env } = require('./config');
const templates = require('./templates');
const { extrasToText } = require('./fieldMap');

let transporter = null;
if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
}

let twilioClient = null;
if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

// Merge lead fields + client identity + extras into one placeholder namespace
function templateData(lead) {
  return Object.assign(
    {},
    lead,
    {
      brandName: config.client.brandName,
      website: config.client.website,
      repName: config.client.repName,
      extras: extrasToText(lead.extras || {})
    }
  );
}

function sendSms(to, body, label) {
  if (!twilioClient || !env.TWILIO_FROM_NUMBER) {
    console.log(`[SIMULATION] SMS ${label} -> ${to || '(no number)'}: "${body}"`);
    return Promise.resolve({ simulated: true });
  }
  return twilioClient.messages
    .create({ body, from: env.TWILIO_FROM_NUMBER, to })
    .then(msg => {
      console.log(`[SMS] ${label} sent to ${to} (SID: ${msg.sid})`);
      return msg;
    });
}

function sendEmail(to, subject, text, label) {
  if (!transporter || !env.SMTP_FROM_EMAIL) {
    console.log(`[SIMULATION] Email ${label} -> ${to || '(no email)'}: "${subject}"\n${text}`);
    return Promise.resolve({ simulated: true });
  }
  return transporter
    .sendMail({ from: env.SMTP_FROM_EMAIL, to, subject, text })
    .then(info => {
      console.log(`[EMAIL] ${label} sent to ${to}`);
      return info;
    });
}

// Instant alerts to every configured BD rep. Fire-and-forget: the lead's
// intake response never waits on these, failures are logged.
function sendAdminAlerts(lead) {
  const data = templateData(lead);
  const smsBody = templates.render(config.messages.adminSms, data);
  const emailSubject = templates.render(config.messages.adminEmailSubject, data);
  const emailBody = templates.render(config.messages.adminEmailBody, data);

  if (env.ADMIN_PHONE.length) {
    for (const phone of env.ADMIN_PHONE) {
      sendSms(phone, smsBody, 'admin alert').catch(err =>
        console.error(`[ERROR] Admin SMS to ${phone} failed: ${err.message}`)
      );
    }
  } else {
    console.log(`[SKIP] No ADMIN_PHONE configured. Admin SMS alert not sent: "${smsBody}"`);
  }
  if (env.ADMIN_EMAIL.length) {
    for (const email of env.ADMIN_EMAIL) {
      sendEmail(email, emailSubject, emailBody, 'admin alert').catch(err =>
        console.error(`[ERROR] Admin email to ${email} failed: ${err.message}`)
      );
    }
  } else {
    console.log(`[SKIP] No ADMIN_EMAIL configured. Admin email alert not sent: "${emailSubject}"`);
  }
}

// Delayed follow-ups to the lead. These return promises that REJECT on
// failure so the queue can apply its single-retry policy.
function sendLeadFollowUp(lead, channel, variant) {
  const data = templateData(lead);

  if (channel === 'sms') {
    const body = templates.render(config.messages.leadSms[variant], data);
    return sendSms(lead.phone, body, `lead follow-up (${variant})`);
  }
  if (channel === 'email') {
    const subject = templates.render(config.messages.leadEmailSubject, data);
    const body = templates.render(config.messages.leadEmailBody[variant], data);
    return sendEmail(lead.email, subject, body, `lead follow-up (${variant})`);
  }
  return Promise.reject(new Error(`Unknown follow-up channel: ${channel}`));
}

module.exports = {
  sendAdminAlerts,
  sendLeadFollowUp,
  isTwilioConfigured: () => Boolean(twilioClient && env.TWILIO_FROM_NUMBER),
  isSmtpConfigured: () => Boolean(transporter && env.SMTP_FROM_EMAIL)
};
