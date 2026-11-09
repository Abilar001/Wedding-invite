# Kishin &amp; Jessica — 3D Wedding Invitation

A single-page, cinematic wedding invitation for **Kishin & Jessica Pelipel** — December 08, 2026, Capoocan, Leyte.

## Run locally

**With live RSVP email** (recommended) — `npm install`, copy `.env.example` to `.env` and fill in a Brevo API key and sender address, then `npm start`. See [RSVP backend](#rsvp-backend-brevo-https-api).

**Static preview only** — no build step, no dependencies:

```bash
# option 1 — Python
python -m http.server 5173

# option 2 — Node
npx serve .
```

Then open <http://localhost:5173>.

> Opening `index.html` by double-clicking also works, but a local server is recommended so the
> SVG gallery images and Google Fonts load consistently.

## Project structure

```
server/index.js     Express server: serves the site, POST /api/rsvp (validation, rate limit)
server/mail.js      Brevo HTTPS email API + couple and guest email templates
server/admin.js     Password-protected RSVP dashboard at /admin
package.json        npm start / npm run dev
.env.example        Brevo credentials template
index.html          All markup (sections, envelope, nav, modals) + inline SVG icon sprite
css/styles.css      Design tokens, 3D envelope, layout, animations, responsive rules
js/app.js           Loader, envelope sequence, nav, reveals, parallax, countdown,
                    gallery + lightbox, RSVP flow, music controls
js/music.js         YouTube IFrame player for the couple's song (play/pause/mute)
assets/             Gallery placeholder images, favicon
```

## What is interactive

| Control | Behaviour |
| --- | --- |
| Envelope / **Open Invitation** | 3D flap rotation, wax seal dissolve, card lift, cinematic hand-off to the hero, music starts |
| **Enter without animation** | Skips the intro for guests who prefer no motion |
| Navigation + mobile menu | Smooth scroll, sticky bar, active-section highlight, Escape/outside-click closes |
| Music FAB (play/pause + mute) | Drives the YouTube track; the equaliser and label follow the player's real state, not a guess. The player is clipped to 1px, and only appears as a small card if the browser blocks autoplay and needs one tap |
| Countdown | Live days/hours/minutes/seconds to `2026-12-08T14:00:00+08:00`; celebratory message on the day |
| Gallery arrows / dots / photos | Scroll-snap carousel, per-photo dots, arrow keys and Escape in the lightbox |
| RSVP | Validates the form, sends it to the email API, emails the couple and confirms to the guest (falls back to copy/Messenger when no server is running) |
| Get Directions | Google Maps search links for both venues |
| Scroll-to-top | Appears after 480 px, returns focus to the monogram |

## RSVP without the backend (fallback)

When the site is served as static files, there is no backend. The form **never fakes a successful submission**: on submit it shows the exact
message that will be sent and asks the guest to deliver it. To make delivery one tap, set your
details at the top of `js/app.js`:

```js
var CONFIG = {
  messengerUsername: 'your.messenger.username', // enables m.me deep link with prefilled text
  rsvpEmail: 'you@example.com'                  // optional "Send by email" button
};
```

Without these values the "Send via Messenger" button opens Messenger and the guest pastes the copied
details. Responses are also kept in `localStorage` on the guest's device as a draft.

For live delivery use the backend above. Otherwise point `rsvpEmail` at your address, or swap the submit handler for a Google Form /
Formspree / Firebase endpoint inside `js/app.js` → section 10.

## RSVP backend (Brevo HTTPS API)

The site also runs as a plain static page, but with the included Node server the RSVP form delivers real mail:

- **To the couple** — a formatted "New RSVP" email with `Reply-To` set to the guest, so replying answers them directly.
- **To the guest** — a confirmation email with their submitted details and both venue addresses.

Mail is sent over HTTPS to Brevo's transactional API instead of through SMTP, so the same code works on hosts that block outbound mail ports. Brevo's free plan covers 300 emails a day — far more than a wedding needs — and lets you verify a single sender address, so no domain or paid plan is required. Free-plan mail carries a small "Sent with Brevo" sticker; only a paid plan removes it.

A guest only sees "sent" after the API has accepted the couple's notification.

### 1. Get a Brevo API key

Create a free account at <https://brevo.com>. Under *Senders, Domains and IPs* add your address (a Gmail address is fine) and enter the six-digit code Brevo emails you. Then open *SMTP & API → API Keys* and create one; it looks like `xkeysib-…`.

### 2. Configure

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
BREVO_API_KEY=xkeysib-your-api-key
RSVP_FROM_EMAIL=your.address@gmail.com
RSVP_TO_EMAIL=your.address@gmail.com
FROM_NAME=Kishin & Jessica
PORT=3000
```

`RSVP_FROM_EMAIL` must be the verified sender — Brevo rejects any other address.

### 3. Run

```bash
npm start
```

Open <http://localhost:3000>. The console prints `API key and sender accepted` when Brevo accepts the credentials. If it does not, the form reports a delivery failure instead of pretending to succeed.

### API

`POST /api/rsvp`

```json
{ "name": "Maria Santos", "email": "maria@example.com",
  "attendance": "accept", "guests": 3, "message": "So happy for you!" }
```

| Response | Meaning |
| --- | --- |
| `200 {ok:true, confirmationSent:true}` | Both emails accepted by Brevo |
| `200 {ok:true, confirmationSent:false}` | Couple notified; the guest confirmation failed |
| `400 {ok:false, fields:{…}}` | Validation failed |
| `429` | More than 5 replies from one IP within 10 minutes |
| `502` | Delivery to the couple failed — the guest is asked to send manually |
| `503` | `BREVO_API_KEY` / `RSVP_FROM_EMAIL` are missing |

`GET /api/health` reports whether mail is configured. Replies are also appended to `data/rsvps.jsonl` (git-ignored) so a mail hiccup never loses a response, and `.env` / `server/` are never served publicly.

### Admin dashboard

`GET /admin` lists every reply from `data/rsvps.jsonl`, newest first, with four totals: total replies, attending, declined, and guests expected. Set a password to open it:

```
ADMIN_PASSWORD=choose-a-strong-password
# ADMIN_SESSION_SECRET=optional-long-random-string
```

Without `ADMIN_PASSWORD` the dashboard returns `503` rather than exposing guest data. With it, `/admin` redirects to a sign-in page; the password is checked server-side, five failed attempts per IP are allowed per ten minutes, and a successful sign-in sets an `HttpOnly`, `SameSite=Strict` cookie scoped to `/admin` for eight hours. Signing out clears it. Pages are sent with `no-store` and `noindex`, and every guest field is HTML-escaped before display.

From the dashboard you can **delete a reply** (it asks for confirmation first). The JSONL backup is rewritten atomically, so totals and the headcount update immediately, and the deleted invitation returns to Pending. Deleting requires the session cookie plus a CSRF token embedded in the form; anything else gets `403`. If `ADMIN_SESSION_SECRET` is unset, the signing key is derived from `ADMIN_PASSWORD`, so sessions survive a restart but change when the password does.

Serve the dashboard over HTTPS: the cookie is marked `secure` only when the request is HTTPS or `X-Forwarded-Proto` says so. Sessions are stateless, so a copied cookie stays valid until it expires even after logging out on another device.

"Guests expected" adds up only the guests on accepting replies; declines contribute 0.

#### Accepted vs pending invitations

To show pending invitations, the dashboard needs to know who was invited. Copy the sample list:

```bash
cp invitations.example.json data/invitations.json
```

```json
[
  { "name": "Santos Family", "email": "maria@example.com", "seats": 4 },
  { "name": "Ana Lopez", "seats": 2 }
]
```

Each party is matched to a reply by `email` first and then by exact name, so `email` is optional. `seats` is how many seats that party was reserved and feeds **Seats pending**. A party with no matching reply is shown as **Pending** and contributes its seats; an accepted party contributes its confirmed headcount; a decline contributes 0.

Replies that match no invitation are still listed, marked **Unlisted reply**, so nobody disappears from the count. Without `data/invitations.json` the pending cards show a dash and the page explains how to add the list.

The breakdown table shows every party with invited seats, status, confirmed headcount and reply time, ordered Pending, Accepted, Declined, with a totals row underneath.

### Deploying with email

GitHub Pages, Netlify and Vercel cannot run Node, so the form falls back to the copy-and-send panel there. Live email and `/admin` need a long-running Node process.

Because mail leaves over HTTPS, free tiers now work:

- **Render** — the free plan blocks outbound SMTP (ports 25/465/587 since Sep 2025), which no longer matters. It has no persistent disk, so `rsvps.jsonl` survives only as long as the instance, and a sleeping service takes about 30 seconds to wake on the first visit after 15 idle minutes. Every reply is still delivered to the couple's inbox, which is the real record; `/admin` is a convenience view.
- **Railway, Fly.io, a small VPS** — any host that runs Node and can reach `https://api.brevo.com`.

### Deploying on Abasthan

Abasthan runs Node web services directly, so the RSVP email and `/admin` both work:

1. **Create App → Web Service**, connect GitHub and pick `Abilar001/Wedding-invite`, branch `main`.
2. Runtime **Node.js 22**, root directory empty, build command `npm ci --omit=dev`, start command `npm start`.
3. Add `BREVO_API_KEY`, `RSVP_FROM_EMAIL`, `RSVP_TO_EMAIL`, `FROM_NAME`, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` under **Environment**. `.env` is git-ignored, so it never reaches the platform from Git — use **Import .env File** to paste the same keys, or type them in.
4. Deploy, then check `/api/health` reports `"mail":"configured"` and sign in at `/admin`.
5. Turn on **Auto-Deploy** so pushes to `main` roll out automatically.

The free plan gives one app a `https://<name>.abasthan.app` URL with SSL. For a custom domain, add it under the service's **Custom Domains** settings and create the CNAME the dashboard shows (subdomain → `abasthan.app`) or the A record it gives for an apex domain.

Containers are rebuilt from Git on every deploy, so `data/rsvps.jsonl` and `data/invitations.json` are lost each time; the couple's inbox remains the record and `/admin` is a view of whatever the current instance holds.

This repo also ships `render.yaml`, a blueprint for a free Render instance:

1. Push the repository to GitHub (`git init`, stage, commit, then add your remote).
2. On Render: **New → Blueprint**, pick the repo. Render creates the service and prompts for the values marked `sync: false`.
3. Enter `BREVO_API_KEY`, `RSVP_FROM_EMAIL`, `RSVP_TO_EMAIL` and `ADMIN_PASSWORD`; `FROM_NAME` and `ADMIN_SESSION_SECRET` come from the blueprint.
4. Wait for the `/api/health` check to go green, open the URL, and sign in at `/admin`.
5. Optional: to keep the dashboard across deploys, move the service to a paid instance type, add a disk mounted at `/var/data`, and set `DATA_DIR=/var/data`. That is also where `invitations.json` belongs when you want pending parties listed.

Render terminates HTTPS for you, which the admin session cookie depends on. Keep `ADMIN_SESSION_SECRET` fixed so sign-ins survive restarts.

## Swap in real photographs

Replace `assets/gallery-1.svg` … `gallery-6.svg` with your own images and update the `src` values in
`index.html` (search for `gallery-`). Portrait crops (4:5) look best.

## Accessibility & performance

- Respects `prefers-reduced-motion` (particles, parallax and the envelope sequence are skipped).
- Keyboard operable: focus styles, Escape closes menus/lightbox, arrow keys browse photos.
- Content is only hidden for reveal animations when JavaScript is available, so a JS failure never
  leaves a blank page.
- No third-party JavaScript; every animation is CSS or hand-written.

## Deploy

**GitHub Pages** — push the folder to a repository, then *Settings → Pages → Branch: `main` / root*.

**Netlify** — drag the folder onto <https://app.netlify.com/drop>, or connect the repo with build
command *(none)* and publish directory `.`.

**Vercel** — `vercel` in this folder, framework preset **Other**, output directory `.`.

All three serve the site as static files; there is nothing to compile. They cannot send RSVP email or serve `/admin` — use the Node deploy above for that.
