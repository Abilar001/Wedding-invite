import nodemailer from 'nodemailer';

const USER = (process.env.GMAIL_USER || '').trim();
const PASS = (process.env.GMAIL_APP_PASSWORD || '').trim();
const TO = (process.env.RSVP_TO_EMAIL || USER).trim();
const FROM_NAME = (process.env.FROM_NAME || 'Kishin & Jessica Wedding').trim();

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === 'true'
  : PORT === 465;

export const COUPLE_EMAIL = TO;

export function isMailConfigured() {
  return Boolean(USER && PASS && TO);
}

let transporter = null;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }
  return transporter;
}

export async function verifyMailer() {
  if (!isMailConfigured()) return false;
  await getTransporter().verify();
  return true;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function nl2br(value) {
  return esc(value).replace(/\r?\n/g, '<br>');
}

function fromHeader() {
  return '"' + FROM_NAME.replace(/"/g, '') + '" <' + USER + '>';
}

function attendanceLabel(rsvp) {
  return rsvp.attendance === 'accept' ? 'Joyfully Accepts' : 'Regretfully Declines';
}

function shell(inner) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5E6E3;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5E6E3;padding:28px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFF8F0;border:1px solid #E3CDB4;border-radius:6px;overflow:hidden;">' +
    '<tr><td style="background:#5B0E1E;padding:30px 24px;text-align:center;">' +
    '<div style="font-family:Georgia,serif;font-size:13px;letter-spacing:5px;text-transform:uppercase;color:#D6B878;">The Wedding of</div>' +
    '<div style="font-family:Georgia,serif;font-size:30px;color:#FFF8F0;margin-top:8px;">Kishin &amp; Jessica</div>' +
    '<div style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#B76E79;margin-top:10px;">December 08, 2026 &middot; Capoocan, Leyte</div>' +
    '</td></tr>' +
    '<tr><td style="padding:32px 28px;font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#2E1A1C;">' + inner + '</td></tr>' +
    '<tr><td style="padding:20px 28px 28px;border-top:1px solid #EADFD2;font-family:Arial,sans-serif;font-size:11px;line-height:1.7;color:#8A6A6E;text-align:center;">' +
    'Two hearts, one love, one beautiful beginning.' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function detailRow(label, value) {
  return '<tr>' +
    '<td style="padding:10px 0;border-bottom:1px solid #EADFD2;font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#B76E79;width:38%;vertical-align:top;">' + esc(label) + '</td>' +
    '<td style="padding:10px 0;border-bottom:1px solid #EADFD2;color:#2E1A1C;">' + value + '</td>' +
    '</tr>';
}

/* ------------------------------------------------------------------ */
/* 1. Notification for the couple                                      */
/* ------------------------------------------------------------------ */

export function sendCoupleNotification(rsvp) {
  const rows = detailRow('Name', esc(rsvp.name)) +
    detailRow('Email', '<a href="mailto:' + esc(rsvp.email) + '" style="color:#800020;">' + esc(rsvp.email) + '</a>') +
    detailRow('Attendance', esc(attendanceLabel(rsvp))) +
    (rsvp.attendance === 'accept'
      ? detailRow('Guests', esc(rsvp.guests + (rsvp.guests === 1 ? ' person' : ' people')))
      : '') +
    detailRow('Received', esc(new Date(rsvp.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })));

  const messageBlock = rsvp.message
    ? '<p style="margin:22px 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#B76E79;">Message</p>' +
      '<div style="padding:14px 16px;background:#F5E6E3;border-left:3px solid #D6B878;color:#2E1A1C;font-style:italic;">' + nl2br(rsvp.message) + '</div>'
    : '';

  const inner =
    '<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#B76E79;">New RSVP</p>' +
    '<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#5B0E1E;">' +
    (rsvp.attendance === 'accept' ? 'A guest will celebrate with you' : 'A guest sends their regrets') + '</h1>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + rows + '</table>' +
    messageBlock +
    '<p style="margin:22px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#8A6A6E;">Replying to this email writes directly to ' + esc(rsvp.email) + '.</p>';

  const text = [
    'NEW RSVP - Kishin & Jessica, December 08, 2026',
    '',
    'Name: ' + rsvp.name,
    'Email: ' + rsvp.email,
    'Attendance: ' + attendanceLabel(rsvp),
    rsvp.attendance === 'accept' ? 'Guests: ' + rsvp.guests : '',
    'Received: ' + new Date(rsvp.submittedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
    rsvp.message ? '\nMessage:\n' + rsvp.message : '',
    '',
    '--',
    'Reply to this email to answer the guest directly.'
  ].filter(Boolean).join('\n');

  return getTransporter().sendMail({
    from: fromHeader(),
    to: TO,
    replyTo: rsvp.email,
    subject: 'New RSVP - ' + rsvp.name + ' (' + attendanceLabel(rsvp) + ')',
    text: text,
    html: shell(inner)
  });
}

/* ------------------------------------------------------------------ */
/* 2. Confirmation for the guest                                       */
/* ------------------------------------------------------------------ */

export function sendGuestConfirmation(rsvp) {
  const rows = detailRow('Name', esc(rsvp.name)) +
    detailRow('Attendance', esc(attendanceLabel(rsvp))) +
    (rsvp.attendance === 'accept' ? detailRow('Guests', esc(String(rsvp.guests))) : '');

  const inner =
    '<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#B76E79;">RSVP Confirmation</p>' +
    '<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#5B0E1E;">Thank you, ' + esc(rsvp.name.split(' ')[0]) + '!</h1>' +
    '<p style="margin:0 0 8px;">' +
    (rsvp.attendance === 'accept'
      ? 'We have received your reservation and could not be happier that you will celebrate with us.'
      : 'Thank you for letting us know. We will miss you, and we are grateful for your reply.') +
    '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0 4px;">' + rows + '</table>' +
    (rsvp.message ? '<p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#8A6A6E;">Your message to the couple was included with your reply.</p>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;padding:0;border-top:1px solid #EADFD2;">' +
    '<tr><td style="padding:18px 0 0;">' +
    '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#B76E79;">Ceremony</p>' +
    '<p style="margin:0 0 14px;">The Most Holy Name of Jesus Parish<br>Capoocan, Leyte<br>Tuesday, December 08, 2026 at 2:00 PM</p>' +
    '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#B76E79;">Reception</p>' +
    '<p style="margin:0;">Capoocan Gymnasium<br>Capoocan, Leyte</p>' +
    '</td></tr></table>' +
    '<p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#8A6A6E;">Need to change your response? Submit the RSVP form again before November 25, 2026. Replying to this email reaches the couple directly.</p>';

  const text = [
    'Thank you, ' + rsvp.name.split(' ')[0] + '!',
    '',
    'We have received your response to Kishin & Jessica\'s wedding.',
    '',
    'Name: ' + rsvp.name,
    'Attendance: ' + attendanceLabel(rsvp),
    rsvp.attendance === 'accept' ? 'Guests: ' + rsvp.guests : '',
    '',
    'Ceremony: The Most Holy Name of Jesus Parish, Capoocan, Leyte',
    'Tuesday, December 08, 2026 at 2:00 PM',
    'Reception: Capoocan Gymnasium, Capoocan, Leyte',
    '',
    'Need to change your response? Submit the RSVP form again before November 25, 2026.',
    '',
    '--',
    'Replying to this email reaches the couple directly.'
  ].filter(Boolean).join('\n');

  return getTransporter().sendMail({
    from: fromHeader(),
    to: rsvp.email,
    replyTo: TO,
    subject: 'Your RSVP to Kishin & Jessica - December 08, 2026',
    text: text,
    html: shell(inner)
  });
}
