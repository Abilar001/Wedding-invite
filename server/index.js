import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  isMailConfigured,
  verifyMailer,
  sendCoupleNotification,
  sendGuestConfirmation
} from './mail.js';
import { createAdminRouter } from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
/* On a cloud host the project directory is replaced on every deploy, so a
   mounted volume (e.g. DATA_DIR=/var/data) keeps rsvps.jsonl durable. */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
const RSVP_LOG = path.join(DATA_DIR, 'rsvps.jsonl');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

/* ------------------------------------------------------------------ */
/* Static invitation                                                   */
/* ------------------------------------------------------------------ */
app.use('/css', express.static(path.join(ROOT, 'css'), { maxAge: '1h' }));
app.use('/js', express.static(path.join(ROOT, 'js'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '7d' }));
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

/* Password-protected RSVP dashboard (reads the backup and the invitation list). */
app.use('/admin', createAdminRouter({
  rsvpLogPath: RSVP_LOG,
  invitationsPath: path.join(DATA_DIR, 'invitations.json')
}));

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function toInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------------ */
/* Basic abuse protection: 5 submissions per IP per 10 minutes         */
/* ------------------------------------------------------------------ */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function withinRateLimit(ip) {
  const now = Date.now();
  const record = hits.get(ip);
  if (!record || now - record.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  record.count += 1;
  return record.count <= MAX_PER_WINDOW;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of hits) {
    if (now - record.start > WINDOW_MS) hits.delete(ip);
  }
}, WINDOW_MS);
if (sweep.unref) sweep.unref();

/* ------------------------------------------------------------------ */
/* Local backup so a delivery hiccup never loses a response            */
/* ------------------------------------------------------------------ */
async function appendRecord(record) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(RSVP_LOG, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error('[rsvp] could not write local backup:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mail: isMailConfigured() ? 'configured' : 'missing-credentials',
    uptime: Math.round(process.uptime())
  });
});

app.post('/api/rsvp', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (!withinRateLimit(req.ip || req.socket.remoteAddress || 'unknown')) {
    return res.status(429).json({
      ok: false,
      error: 'Too many replies from this connection. Please wait a few minutes and try again.'
    });
  }

  // Hidden field: only automated form-fillers touch it.
  if (text(body.guestFax, 50)) {
    return res.status(400).json({ ok: false, error: 'This submission was rejected as spam.' });
  }

  const name = text(body.name, 80);
  const email = text(body.email, 120);
  const attendance = body.attendance === 'accept' ? 'accept'
    : body.attendance === 'decline' ? 'decline' : '';
  const guests = attendance === 'accept' ? toInt(body.guests, 1, 6) : 0;
  const message = text(body.message, 1000);

  const fields = {};
  if (name.length < 2) fields.name = 'Please enter your full name.';
  if (!EMAIL_RE.test(email)) fields.email = 'Please enter a valid email address.';
  if (!attendance) fields.attendance = 'Please choose whether you will attend.';

  if (Object.keys(fields).length) {
    return res.status(400).json({
      ok: false,
      error: Object.values(fields)[0],
      fields
    });
  }

  if (!isMailConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'Online RSVP is not available yet. Please contact Kishin & Jessica through Messenger.'
    });
  }

  const rsvp = {
    name,
    email,
    attendance,
    guests,
    message,
    submittedAt: new Date().toISOString(),
    receivedInManila: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
  };

  await appendRecord(rsvp);

  try {
    await sendCoupleNotification(rsvp);
  } catch (err) {
    console.error('[rsvp] couple notification failed:', err.message);
    return res.status(502).json({
      ok: false,
      error: 'We could not deliver your RSVP right now. Please try again in a moment, or message the couple directly.'
    });
  }

  let confirmationSent = true;
  try {
    await sendGuestConfirmation(rsvp);
  } catch (err) {
    confirmationSent = false;
    console.error('[rsvp] guest confirmation failed:', err.message);
  }

  console.log('[rsvp] ' + attendance + ' - ' + name + ' <' + email + '>' +
    (attendance === 'accept' ? ' - ' + guests + ' guest(s)' : ''));

  res.json({ ok: true, confirmationSent });
});

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

/* Never serve secrets even though the public assets sit beside them. */
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' });
  }
  console.error('[server]', err);
  res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */
const server = app.listen(PORT, () => {
  console.log('');
  console.log('  Kishin & Jessica - wedding invitation');
  console.log('  Local:  http://localhost:' + PORT);
  if (isMailConfigured()) {
    console.log('  RSVP:   Gmail SMTP via ' + (process.env.SMTP_HOST || 'smtp.gmail.com'));
    verifyMailer()
      .then(() => console.log('  RSVP:   SMTP login OK'))
      .catch((err) => console.error('  RSVP:   SMTP login failed -', err.message));
  } else {
    console.warn('  RSVP:   not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env');
  }
  console.log('');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
