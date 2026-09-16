// DearSelf Web Push server — V44.3
// No shared API key is used.
// Authorization is tied to the browser's Web Push subscription itself.
//
// Required environment variables:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
// Optional:
//   VAPID_SUBJECT (defaults to a safe placeholder)
//   PORT (defaults to 3000)
//
// Install:
//   npm install
// Run:
//   npm start
//
// IMPORTANT: Never put VAPID_PRIVATE_KEY in the PWA/frontend.

const express = require("express");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "2mb" }));

// GitHub Pages / Cloudflare Pages / other hosted frontends need CORS.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = Number(process.env.PORT || 3000);
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:dearself-notifications@example.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
  console.error("Generate keys with: npx web-push generate-vapid-keys");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEVICES_FILE = path.join(DATA_DIR, "devices.json");

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function endpointId(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint)).digest("hex");
}

function cleanSubscription(sub) {
  if (!sub || typeof sub !== "object" || typeof sub.endpoint !== "string") return null;
  if (!sub.endpoint.startsWith("https://")) return null;
  if (!sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string") return null;
  return {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth
    }
  };
}

function validItem(item) {
  return item &&
    typeof item.key === "string" &&
    item.key.length <= 240 &&
    typeof item.title === "string" &&
    item.title.length <= 200 &&
    typeof item.body === "string" &&
    item.body.length <= 1000 &&
    Number.isFinite(Number(item.fireAt));
}

function getDevices() {
  const data = readJSON(DEVICES_FILE, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

// Public key is safe to expose; it is required by PushManager.subscribe().
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

// Register/refresh this browser's push subscription.
// No shared secret is sent by the frontend.
app.post("/api/subscribe", (req, res) => {
  const sub = cleanSubscription(req.body && req.body.subscription);
  if (!sub) return res.status(400).json({ error: "invalid subscription" });

  const devices = getDevices();
  const id = endpointId(sub.endpoint);
  const existing = devices[id] || {};

  devices[id] = {
    subscription: sub,
    schedule: Array.isArray(existing.schedule) ? existing.schedule : [],
    updatedAt: Date.now()
  };

  writeJSON(DEVICES_FILE, devices);
  res.json({ ok: true, deviceId: id });
});

// Delete this browser's subscription and all of its scheduled reminders.
app.post("/api/unsubscribe", (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== "string") return res.status(400).json({ error: "invalid endpoint" });

  const devices = getDevices();
  const id = endpointId(endpoint);
  if (devices[id]) {
    delete devices[id];
    writeJSON(DEVICES_FILE, devices);
  }
  res.json({ ok: true });
});

// Sync ONLY the schedule belonging to the supplied subscription.
// This replaces the old global schedule.json design.
app.post("/api/schedule", (req, res) => {
  const sub = cleanSubscription(req.body && req.body.subscription);
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];

  if (!sub) return res.status(400).json({ error: "invalid subscription" });
  if (items.length > 500) return res.status(413).json({ error: "too many reminders" });

  const safeItems = items
    .filter(validItem)
    .map(x => ({
      key: x.key,
      title: x.title,
      body: x.body,
      fireAt: Number(x.fireAt),
      url: typeof x.url === "string" && x.url.startsWith("/") ? x.url : "/"
    }))
    .filter(x => x.fireAt > Date.now() - 60 * 1000);

  const devices = getDevices();
  const id = endpointId(sub.endpoint);
  const existing = devices[id] || {};

  // Preserve sent state only when key + fireAt are unchanged.
  const sentByKey = new Map(
    (Array.isArray(existing.schedule) ? existing.schedule : [])
      .filter(x => x && x.sent)
      .map(x => [`${x.key}|${x.fireAt}`, x])
  );

  const merged = safeItems.map(item => {
    const previous = sentByKey.get(`${item.key}|${item.fireAt}`);
    return previous ? { ...item, sent: true } : { ...item, sent: false };
  });

  devices[id] = {
    subscription: sub,
    schedule: merged,
    updatedAt: Date.now()
  };

  writeJSON(DEVICES_FILE, devices);
  res.json({ ok: true, count: merged.length });
});

async function tick() {
  const devices = getDevices();
  let changed = false;

  for (const id of Object.keys(devices)) {
    const device = devices[id];
    if (!device || !device.subscription) {
      delete devices[id];
      changed = true;
      continue;
    }

    const schedule = Array.isArray(device.schedule) ? device.schedule : [];
    let deviceChanged = false;

    for (const item of schedule) {
      if (!item || item.sent || !Number.isFinite(Number(item.fireAt)) || Number(item.fireAt) > Date.now()) continue;

      item.sent = true;
      deviceChanged = true;

      const payload = JSON.stringify({
        title: item.title || "DearSelf",
        body: item.body || "",
        tag: item.key || undefined,
        url: item.url || "/"
      });

      try {
        await webpush.sendNotification(device.subscription, payload, { TTL: 300 });
      } catch (err) {
        console.error("Push error:", err.statusCode || "", err.message || err);

        // Subscription is no longer usable.
        if (err.statusCode === 404 || err.statusCode === 410) {
          delete devices[id];
          changed = true;
          break;
        }

        // Leave the item marked sent so a transient failure cannot spam it
        // repeatedly. The client will resync if the reminder is still active.
      }
    }

    if (devices[id] && deviceChanged) {
      devices[id].schedule = schedule;
      devices[id].updatedAt = Date.now();
      changed = true;
    }
  }

  if (changed) writeJSON(DEVICES_FILE, devices);
}

setInterval(tick, 30 * 1000);
tick();

app.get("/", (req, res) => {
  res.type("text").send("DearSelf push server is running.");
});

app.listen(PORT, () => {
  console.log(`DearSelf push server listening on port ${PORT}`);
});
