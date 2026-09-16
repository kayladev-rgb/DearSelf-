// DearSelf V46.1 push server
// Stores push subscriptions + a reminder schedule the client keeps in sync,
// and sends a Web Push notification the moment each reminder's fireAt time arrives.
//
// Setup:
//   1. npm install
//   2. npx web-push generate-vapid-keys   (copy the two keys)
//   3. Set env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, API_KEY (optional but recommended)
//   4. npm start

const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:you@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars.');
  console.error('Generate a pair with: npx web-push generate-vapid-keys');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

if (!API_KEY) {
  console.warn('WARNING: API_KEY is not set. This server will accept requests from anyone who finds its URL.');
}

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

function checkAuth(req, res, next) {
  if (!API_KEY) return next();
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

// Save (or refresh) a push subscription for this device.
app.post('/api/subscribe', checkAuth, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'invalid subscription' });
  const subs = readJSON(SUBS_FILE, []).filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  writeJSON(SUBS_FILE, subs);
  res.json({ ok: true });
});

app.post('/api/unsubscribe', checkAuth, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  const subs = readJSON(SUBS_FILE, []).filter((s) => s.endpoint !== endpoint);
  writeJSON(SUBS_FILE, subs);
  res.json({ ok: true });
});

// Client posts its full current set of upcoming reminders every time
// something relevant changes. Each item: { key, title, body, fireAt, url }
// fireAt is an epoch-ms timestamp already adjusted for the user's lead time.
app.post('/api/schedule', checkAuth, (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const existing = readJSON(SCHEDULE_FILE, []);
  const sentByKey = new Map(existing.filter((x) => x.sent).map((x) => [x.key, x]));
  // Keep "sent" status only if the item is unchanged (same key + same fireAt);
  // if fireAt moved (user edited the due date), treat it as a fresh reminder.
  const mergedRaw = items.map((it) => {
    const prevSent = sentByKey.get(it.key);
    if (prevSent && prevSent.fireAt === it.fireAt) return prevSent;
    return { ...it, sent: false };
  });
  // A client can briefly sync twice while changing settings. Keep exactly
  // one server-side entry for each reminder key + fireAt pair.
  const seen = new Set();
  const merged = mergedRaw.filter(it => {
    const k = String(it.key) + '|' + String(it.fireAt);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  writeJSON(SCHEDULE_FILE, merged);
  res.json({ ok: true, count: merged.length });
});

let tickRunning = false;
async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
  const now = Date.now();
  const schedule = readJSON(SCHEDULE_FILE, []);
  const subs = readJSON(SUBS_FILE, []);
  let scheduleChanged = false;
  let subsChanged = false;

  for (const item of schedule) {
    if (item.sent || item.fireAt > now) continue;
    scheduleChanged = true;
    item.sent = true;
    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      tag: item.key,
      url: item.url || '/',
    });
    for (let i = subs.length - 1; i >= 0; i--) {
      try {
        await webpush.sendNotification(subs[i], payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          subs.splice(i, 1);
          subsChanged = true;
        } else {
          console.error('push send error:', err.statusCode, err.body);
        }
      }
    }
  }

  if (scheduleChanged) writeJSON(SCHEDULE_FILE, schedule);
  if (subsChanged) writeJSON(SUBS_FILE, subs);
  } finally {
    tickRunning = false;
  }
}
setInterval(tick, 1000);
tick();

app.listen(PORT, () => console.log(`DearSelf push server listening on :${PORT}`));
