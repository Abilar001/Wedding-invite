import express, { Router } from 'express';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Length-safe constant-time comparison.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function adminPassword() {
  return (process.env.ADMIN_PASSWORD || '').trim();
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function seatsFrom(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : null;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const COOKIE_NAME = 'kj_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sessionSecret() {
  const explicit = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  return crypto.createHash('sha256').update('kj-admin|' + adminPassword()).digest('hex');
}

function createSessionToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const mac = crypto.createHmac('sha256', sessionSecret()).update(String(expires)).digest('hex');
  return expires + '.' + mac;
}

function verifySessionToken(token) {
  if (!token || !adminPassword()) return false;
  const separator = token.indexOf('.');
  if (separator === -1) return false;

  const expires = Number(token.slice(0, separator));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = crypto.createHmac('sha256', sessionSecret()).update(String(expires)).digest('hex');
  return safeEqual(token.slice(separator + 1), expected);
}

function csrfFor(token) {
  return crypto.createHmac('sha256', sessionSecret()).update('csrf|' + token).digest('hex');
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) === name) {
      try {
        return decodeURIComponent(trimmed.slice(separator + 1));
      } catch {
        return '';
      }
    }
  }
  return '';
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

/* ------------------------------------------------------------------ */
/* Login attempts: 5 failures per IP per 10 minutes                    */
/* ------------------------------------------------------------------ */

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map();

function loginLocked(ip) {
  const record = loginFailures.get(ip);
  if (!record) return false;
  if (Date.now() - record.start > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return false;
  }
  return record.count >= LOGIN_MAX_FAILURES;
}

function noteLoginFailure(ip) {
  const now = Date.now();
  const record = loginFailures.get(ip);
  if (!record || now - record.start > LOGIN_WINDOW_MS) {
    loginFailures.set(ip, { start: now, count: 1 });
  } else {
    record.count += 1;
  }
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

function recordId(record) {
  const key = [record.submittedAt, record.email, record.name].join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

async function readRecords(logPath) {
  let raw;
  try {
    raw = await fs.readFile(logPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && typeof record === 'object') {
        record.id = recordId(record);
        records.push(record);
      }
    } catch {
      /* skip a partially written line rather than breaking the page */
    }
  }

  return records.sort(function (a, b) {
    return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
  });
}

async function deleteRecord(logPath, id) {
  let raw;
  try {
    raw = await fs.readFile(logPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }

  const kept = [];
  let removed = false;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (!removed && recordId(record) === id) {
        removed = true;
        continue;
      }
    } catch {
      /* keep malformed lines untouched so nothing is lost silently */
    }
    kept.push(line);
  }

  if (!removed) return false;

  const temp = logPath + '.tmp';
  await fs.writeFile(temp, kept.length ? kept.join('\n') + '\n' : '', 'utf8');
  await fs.rename(temp, logPath);
  return true;
}

async function readInvitations(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[admin] could not read invitations:', err.message);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[admin] invitations file is not valid JSON:', err.message);
    return [];
  }

  const list = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed && parsed.invitations) ? parsed.invitations : [];

  return list
    .filter(function (entry) { return entry && typeof entry === 'object' && (entry.name || entry.email); })
    .map(function (entry) {
      return {
        name: typeof entry.name === 'string' ? entry.name.trim().slice(0, 120) : '',
        email: typeof entry.email === 'string' ? entry.email.trim().toLowerCase().slice(0, 160) : '',
        seats: seatsFrom(entry.seats)
      };
    });
}

/* ------------------------------------------------------------------ */
/* Headcount                                                           */
/* ------------------------------------------------------------------ */

function buildBreakdown(records, invitations) {
  const matched = new Set();
  const parties = [];

  invitations.forEach(function (invitation) {
    const email = normalize(invitation.email);
    let reply = null;

    if (email) {
      reply = records.find(function (r) {
        return !matched.has(r) && normalize(r.email) === email;
      }) || null;
    }
    if (!reply && invitation.name) {
      const name = normalize(invitation.name);
      reply = records.find(function (r) {
        return !matched.has(r) && normalize(r.name) === name;
      }) || null;
    }
    if (reply) matched.add(reply);

    parties.push({
      name: invitation.name || (reply ? reply.name : 'Unnamed invitation'),
      email: invitation.email || (reply ? reply.email : ''),
      seats: invitation.seats,
      status: reply ? (reply.attendance === 'accept' ? 'accepted' : 'declined') : 'pending',
      confirmed: reply && reply.attendance === 'accept' ? (Number.parseInt(reply.guests, 10) || 0) : 0,
      submittedAt: reply ? reply.submittedAt : null,
      unlisted: false
    });
  });

  records.forEach(function (record) {
    if (matched.has(record)) return;
    parties.push({
      name: record.name || 'Unnamed guest',
      email: record.email || '',
      seats: null,
      status: record.attendance === 'accept' ? 'accepted' : 'declined',
      confirmed: record.attendance === 'accept' ? (Number.parseInt(record.guests, 10) || 0) : 0,
      submittedAt: record.submittedAt,
      unlisted: true
    });
  });

  const order = { pending: 0, accepted: 1, declined: 2 };
  parties.sort(function (a, b) {
    return (order[a.status] - order[b.status]) || a.name.localeCompare(b.name);
  });

  const pending = parties.filter(function (p) { return p.status === 'pending'; });

  return {
    parties: parties,
    totals: {
      replies: records.length,
      invitationsTracked: invitations.length > 0,
      pendingParties: pending.length,
      acceptedParties: parties.filter(function (p) { return p.status === 'accepted'; }).length,
      declinedParties: parties.filter(function (p) { return p.status === 'declined'; }).length,
      acceptedSeats: parties.reduce(function (sum, p) { return sum + p.confirmed; }, 0),
      pendingSeats: pending.reduce(function (sum, p) { return sum + (p.seats || 0); }, 0),
      pendingWithoutSeats: pending.filter(function (p) { return p.seats == null; }).length,
      seatsInvited: parties.reduce(function (sum, p) { return sum + (p.seats || 0); }, 0)
    }
  };
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

function shell(title, body) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>' + esc(title) + '</title>' +
    '<style>' +
    ':root{--burgundy:#5B0E1E;--wine:#800020;--champagne:#D6B878;--ivory:#FFF8F0;--ink:#2E1A1C;--soft:#6B4A4E}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;background:var(--ivory);color:var(--ink);font-family:Georgia,serif;line-height:1.6}' +
    'button{font:inherit;cursor:pointer}' +
    'header{background:var(--burgundy);color:var(--ivory);padding:26px 20px}' +
    'header .inner{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between}' +
    'header h1{margin:0;font-size:20px;font-weight:400;letter-spacing:.14em;text-transform:uppercase}' +
    'header h1 span{color:var(--champagne)}' +
    'header .meta{font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,248,240,.65)}' +
    'main{max-width:1100px;margin:0 auto;padding:28px 20px 60px}' +
    '.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}' +
    '.btn{display:inline-block;padding:8px 16px;border-radius:999px;border:1px solid var(--champagne);background:transparent;color:var(--wine);font-family:Arial,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;transition:background-color .2s,color .2s}' +
    '.btn:hover{background:var(--champagne);color:#3B1A1D}' +
    '.btn--danger{padding:5px 12px;font-size:10px;border-color:rgba(128,0,32,.35)}' +
    '.btn--danger:hover{background:var(--wine);color:var(--ivory);border-color:var(--wine)}' +
    '.inline{display:inline;margin:0}' +
    '.flash{padding:12px 16px;border-radius:6px;margin-bottom:18px;font-size:14px;background:#F1F7EE;border:1px solid #BFD8B8;color:#2F5233}' +
    '.flash--error{background:#FBEDEF;border-color:#E3B7BF;color:#7A1B2A}' +
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:26px}' +
    '.stat{background:#fff;border:1px solid rgba(183,110,121,.28);border-radius:6px;padding:16px 18px;box-shadow:0 14px 30px -24px rgba(64,9,15,.6)}' +
    '.stat__label{font-family:Arial,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--wine)}' +
    '.stat__value{display:block;font-size:30px;line-height:1.2;color:var(--burgundy);margin-top:4px}' +
    '.stat--gold{background:linear-gradient(150deg,#FBF3E2,#FFF8F0)}' +
    '.stat__note{display:block;font-family:Arial,sans-serif;font-size:11px;color:var(--soft);margin-top:2px}' +
    'h2.section{font-family:Georgia,serif;font-weight:400;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:var(--wine);margin:34px 0 12px}' +
    '.notice{background:#FBF3E2;border:1px solid rgba(214,184,120,.6);border-radius:6px;padding:14px 16px;margin:0 0 8px;font-size:14px;color:#4A3A2A}' +
    '.notice strong{color:var(--burgundy)}' +
    '.table-wrap{background:#fff;border:1px solid rgba(183,110,121,.24);border-radius:6px;overflow-x:auto}' +
    'table{width:100%;border-collapse:collapse;min-width:720px}' +
    'th{font-family:Arial,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--wine);text-align:left;padding:12px 14px;border-bottom:1px solid #EADFD2;background:#FBF3EA;white-space:nowrap}' +
    'td{padding:12px 14px;border-bottom:1px solid #F0E6D9;vertical-align:top;font-size:15px}' +
    'tbody tr:last-child td{border-bottom:0}' +
    'tfoot td{font-family:Arial,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:12px 14px;background:#FBF3EA;border-top:1px solid #EADFD2;color:var(--burgundy)}' +
    'tr.unlisted td{background:#FDF8F2}' +
    '.tag{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:rgba(107,74,78,.1);color:var(--soft);font-family:Arial,sans-serif;font-size:9px;letter-spacing:.1em;text-transform:uppercase;vertical-align:middle}' +
    '.muted{font-family:Arial,sans-serif;font-size:12px;color:var(--soft)}' +
    '.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}' +
    '.pill--yes{background:rgba(128,0,32,.1);color:var(--wine);border:1px solid rgba(128,0,32,.25)}' +
    '.pill--no{background:rgba(107,74,78,.08);color:var(--soft);border:1px solid rgba(107,74,78,.22)}' +
    '.pill--pending{background:rgba(214,184,120,.2);color:#7A5A1E;border:1px solid rgba(214,184,120,.75)}' +
    '.msg{max-width:240px;white-space:pre-wrap;font-size:14px;color:var(--soft)}' +
    '.empty{padding:44px 20px;text-align:center;color:var(--soft)}' +
    '.empty strong{display:block;font-size:20px;color:var(--burgundy);margin-bottom:6px}' +
    'footer{max-width:1100px;margin:0 auto;padding:0 20px 40px;font-family:Arial,sans-serif;font-size:11px;color:var(--soft)}' +
    'code{background:#F5E6E3;padding:1px 6px;border-radius:3px;font-size:13px}' +
    '.login-wrap{max-width:420px;margin:46px auto;background:#fff;border:1px solid rgba(183,110,121,.28);border-radius:8px;padding:28px;box-shadow:0 20px 50px -34px rgba(64,9,15,.6)}' +
    '.login-wrap h2{margin:0 0 6px;font-size:23px;color:var(--burgundy);font-weight:400}' +
    '.login-wrap p{margin:0 0 18px;font-family:Arial,sans-serif;font-size:13px;color:var(--soft)}' +
    'label{display:block;font-family:Arial,sans-serif;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--wine);margin-bottom:6px}' +
    'input[type=password]{width:100%;padding:12px 14px;border:1px solid #DCC9B9;border-radius:4px;background:#FFFDFA;color:var(--ink);font-family:Georgia,serif;font-size:16px}' +
    'input[type=password]:focus{outline:none;border-color:var(--champagne);box-shadow:0 0 0 3px rgba(214,184,120,.25)}' +
    '.login-wrap .btn{width:100%;margin-top:18px;padding:12px;text-align:center}' +
    '.err{margin-bottom:16px;padding:10px 12px;border-radius:4px;background:#FBEDEF;border:1px solid #E3B7BF;color:#7A1B2A;font-family:Arial,sans-serif;font-size:13px}' +
    '</style></head><body>' +
    '<header><div class="inner"><h1>RSVP Dashboard <span>/ K &amp; J</span></h1>' +
    '<div class="meta">Kishin &amp; Jessica &middot; December 08, 2026</div></div></header>' +
    '<main>' + body + '</main>' +
    '<footer>Sources: <code>data/rsvps.jsonl</code> and <code>data/invitations.json</code> &middot; times shown in Philippine Time (UTC+8).</footer>' +
    '<script>document.addEventListener("submit",function(e){var f=e.target;if(f&&f.dataset&&f.dataset.confirm&&!window.confirm(f.dataset.confirm)){e.preventDefault();}});</script>' +
    '</body></html>';
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function statCard(label, key, value, options) {
  const opts = options || {};
  return '<div class="stat' + (opts.gold ? ' stat--gold' : '') + '">' +
    '<span class="stat__label">' + esc(label) + '</span>' +
    '<span class="stat__value" data-stat="' + key + '">' + esc(value) + '</span>' +
    (opts.note ? '<span class="stat__note">' + esc(opts.note) + '</span>' : '') +
    '</div>';
}

function renderStats(totals) {
  const tracked = totals.invitationsTracked;
  return '<div class="stats">' +
    statCard('Total replies', 'total', totals.replies) +
    statCard('Attending', 'attending', totals.acceptedParties) +
    statCard('Declined', 'declined', totals.declinedParties) +
    statCard('Guests expected', 'guests', totals.acceptedSeats, { gold: true }) +
    statCard('Pending invitations', 'pending-parties', tracked ? totals.pendingParties : '-',
      { note: tracked ? 'awaiting a reply' : 'add invitations.json' }) +
    statCard('Seats pending', 'pending-seats', tracked ? totals.pendingSeats : '-',
      { note: tracked && totals.pendingWithoutSeats ? totals.pendingWithoutSeats + ' without seats set' : '' }) +
    '</div>';
}

function invitationNotice() {
  return '<div class="notice"><strong>Pending invitations are not tracked yet.</strong> ' +
    'Add <code>data/invitations.json</code> (start from <code>invitations.example.json</code>) listing each invited party ' +
    'and its seats. Invitations without a reply then appear as Pending. The breakdown below lists the replies received so far.</div>';
}

function renderHeadcount(parties, totals, tracked) {
  if (!parties.length) {
    return '<div class="table-wrap"><div class="empty"><strong>Nothing to count yet</strong>' +
      'Add invitations or wait for the first reply.</div></div>';
  }

  const labels = { accepted: 'Accepted', declined: 'Declined', pending: 'Pending' };

  const rows = parties.map(function (party) {
    const pill = party.status === 'accepted' ? 'pill--yes'
      : party.status === 'declined' ? 'pill--no' : 'pill--pending';

    return '<tr' + (party.unlisted ? ' class="unlisted"' : '') + '>' +
      '<td>' + esc(party.name) +
        (party.unlisted ? ' <span class="tag">Unlisted reply</span>' : '') +
        (party.email ? '<div class="muted">' + esc(party.email) + '</div>' : '') +
      '</td>' +
      '<td>' + (party.seats == null ? '<span class="muted">-</span>' : 'data-seats="' + party.seats + '">' + party.seats) + '</td>' +
      '<td><span class="pill ' + pill + '" data-status="' + party.status + '">' + labels[party.status] + '</span></td>' +
      '<td>' + (party.status === 'accepted' ? party.confirmed : 0) + '</td>' +
      '<td class="muted" style="white-space:nowrap">' +
        (party.submittedAt ? esc(formatDate(party.submittedAt)) : 'Awaiting reply') +
      '</td>' +
      '</tr>';
  }).join('');

  return '<div class="table-wrap"><table><thead><tr>' +
    '<th>Party</th><th>Invited seats</th><th>Status</th><th>Confirmed headcount</th><th>Received (PHT)</th>' +
    '</tr></thead><tbody>' + rows + '</tbody><tfoot><tr>' +
    '<td colspan="3">Totals</td>' +
    '<td>' + totals.acceptedSeats + ' confirmed</td>' +
    '<td>' + (tracked ? totals.pendingSeats + ' seats pending' : '') + '</td>' +
    '</tr></tfoot></table></div>';
}

function renderTable(records, csrf) {
  if (!records.length) {
    return '<div class="table-wrap"><div class="empty"><strong>No RSVPs yet</strong>' +
      'Replies will appear here as soon as a guest submits the form.</div></div>';
  }

  const rows = records.map(function (record, index) {
    const accepts = record.attendance === 'accept';
    const guests = accepts ? (Number.parseInt(record.guests, 10) || 0) : 0;

    return '<tr>' +
      '<td class="muted">' + (index + 1) + '</td>' +
      '<td>' + esc(record.name || '-') + '</td>' +
      '<td class="muted"><a href="mailto:' + esc(record.email || '') + '" style="color:#800020">' + esc(record.email || '-') + '</a></td>' +
      '<td><span class="pill ' + (accepts ? 'pill--yes' : 'pill--no') + '">' +
        (accepts ? 'Attending' : 'Declined') + '</span></td>' +
      '<td>' + guests + '</td>' +
      '<td class="msg">' + (record.message ? esc(record.message) : '<span class="muted">-</span>') + '</td>' +
      '<td class="muted" style="white-space:nowrap">' + esc(formatDate(record.submittedAt)) + '</td>' +
      '<td>' +
        '<form class="inline" method="post" action="/admin/delete" data-confirm="Delete this reply? This cannot be undone.">' +
          '<input type="hidden" name="csrf" value="' + esc(csrf) + '">' +
          '<input type="hidden" name="id" value="' + esc(record.id) + '">' +
          '<button class="btn btn--danger" type="submit">Delete</button>' +
        '</form>' +
      '</td>' +
      '</tr>';
  }).join('');

  return '<div class="table-wrap"><table><thead><tr>' +
    '<th>#</th><th>Guest</th><th>Email</th><th>RSVP</th><th>Guests</th><th>Message</th><th>Received (PHT)</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderDashboard(records, invitations, csrf, flash) {
  const breakdown = buildBreakdown(records, invitations);
  const tracked = breakdown.totals.invitationsTracked;

  const flashed = flash
    ? '<div class="flash' + (flash.error ? ' flash--error' : '') + '">' + esc(flash.message) + '</div>'
    : '';

  const logout =
    '<div class="topbar"><span class="muted">' + breakdown.totals.replies + ' replies stored</span>' +
    '<form class="inline" method="post" action="/admin/logout">' +
      '<button class="btn" type="submit">Log out</button>' +
    '</form></div>';

  return logout + flashed +
    renderStats(breakdown.totals) +
    (tracked ? '' : invitationNotice()) +
    '<h2 class="section">Headcount by invitation</h2>' +
    renderHeadcount(breakdown.parties, breakdown.totals, tracked) +
    '<h2 class="section">Replies</h2>' +
    renderTable(records, csrf);
}

function renderLogin(message) {
  return '<div class="login-wrap">' +
    '<h2>Admin sign in</h2>' +
    '<p>Enter the admin password to manage RSVP replies.</p>' +
    (message ? '<div class="err">' + esc(message) + '</div>' : '') +
    '<form method="post" action="/admin/login">' +
      '<label for="password">Password</label>' +
      '<input type="password" id="password" name="password" autocomplete="current-password" required autofocus>' +
      '<button class="btn" type="submit">Sign in</button>' +
    '</form>' +
    '</div>';
}

function notConfigured(res) {
  return res.status(503).type('html').send(shell(
    'Dashboard not configured',
    '<p>Set <code>ADMIN_PASSWORD</code> in <code>.env</code> and restart the server to use the RSVP dashboard.</p>' +
    '<p class="muted">Guest data is never shown without a password.</p>'
  ));
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function createAdminRouter(options) {
  const rsvpLogPath = options.rsvpLogPath;
  const invitationsPath = options.invitationsPath;
  const router = Router();

  router.use(express.urlencoded({ extended: false, limit: '8kb' }));

  function noStore(res) {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }

  function sessionFrom(req) {
    const token = readCookie(req, COOKIE_NAME);
    return verifySessionToken(token) ? token : '';
  }

  router.get('/', async function (req, res) {
    noStore(res);
    if (!adminPassword()) return notConfigured(res);

    const token = sessionFrom(req);
    if (!token) return res.redirect(302, '/admin/login');

    let flash = null;
    if (req.query.deleted === '1') flash = { message: 'Reply deleted.' };
    if (req.query.missing === '1') flash = { message: 'That reply was not found.', error: true };

    try {
      const [records, invitations] = await Promise.all([
        readRecords(rsvpLogPath),
        readInvitations(invitationsPath)
      ]);
      res.type('html').send(shell(
        'RSVP Dashboard - Kishin & Jessica',
        renderDashboard(records, invitations, csrfFor(token), flash)
      ));
    } catch (err) {
      console.error('[admin] could not read RSVPs:', err.message);
      res.status(500).type('html').send(shell(
        'Dashboard error',
        '<p>Could not read the RSVP backup. Check the server log.</p>'
      ));
    }
  });

  router.get('/login', function (req, res) {
    noStore(res);
    if (!adminPassword()) return notConfigured(res);
    if (sessionFrom(req)) return res.redirect(302, '/admin');

    let message = '';
    if (req.query.error === '1') message = 'That password is not correct.';
    if (req.query.locked === '1') message = 'Too many attempts. Please wait ten minutes and try again.';

    res.type('html').send(shell('Admin sign in - K & J', renderLogin(message)));
  });

  router.post('/login', function (req, res) {
    noStore(res);
    if (!adminPassword()) return notConfigured(res);

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (loginLocked(ip)) {
      return res.status(429).type('html').send(shell(
        'Too many attempts',
        renderLogin('Too many failed attempts. Please wait ten minutes and try again.')
      ));
    }

    const password = String((req.body && req.body.password) || '');
    if (!safeEqual(password, adminPassword())) {
      noteLoginFailure(ip);
      return res.redirect(303, '/admin/login?error=1');
    }

    loginFailures.delete(ip);
    res.cookie(COOKIE_NAME, createSessionToken(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: isSecureRequest(req),
      path: '/admin',
      maxAge: SESSION_TTL_MS
    });
    return res.redirect(303, '/admin');
  });

  router.post('/logout', function (req, res) {
    noStore(res);
    res.clearCookie(COOKIE_NAME, { path: '/admin' });
    res.redirect(303, '/admin/login');
  });

  router.post('/delete', async function (req, res) {
    noStore(res);
    if (!adminPassword()) return notConfigured(res);

    const token = sessionFrom(req);
    if (!token) return res.redirect(302, '/admin/login');

    const body = req.body || {};
    if (!body.csrf || !safeEqual(body.csrf, csrfFor(token))) {
      return res.status(403).type('text').send('Invalid or missing CSRF token.');
    }

    const id = String(body.id || '');
    try {
      const removed = await deleteRecord(rsvpLogPath, id);
      return res.redirect(303, removed ? '/admin?deleted=1' : '/admin?missing=1');
    } catch (err) {
      console.error('[admin] could not delete reply:', err.message);
      return res.status(500).type('text').send('Could not delete that reply.');
    }
  });

  return router;
}
