// Enter Now Web Push server
// Node 18+. Install: npm install express web-push
// Generate VAPID keys once with: npx web-push generate-vapid-keys
// Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in the server environment.

const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const DATA_DIR = process.env.ENTER_NOW_DATA_DIR || path.join(__dirname, 'data');
const SUB_FILE = path.join(DATA_DIR, 'subscriptions.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSubscriptions() {
  try { return JSON.parse(fs.readFileSync(SUB_FILE, 'utf8')); }
  catch { return []; }
}
function saveSubscriptions(items) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(items, null, 2));
}

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:hello@example.com';
if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

// Active schedules live in memory. This is intentionally simple for the first
// live test; a production deployment should persist sessions in a database.
const sessions = new Map();

function sendToSubscription(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 120,
    urgency: 'high',
    topic: 'enter-now-cue'
  });
}

async function sendCue(clientId, cueNumber) {
  const subscriptions = loadSubscriptions().filter(s => s.clientId === clientId);
  const kept = [];
  for (const subscription of subscriptions) {
    try {
      await sendToSubscription(subscription, {
        title: 'Enter Now',
        body: 'Beep-Boop — Enter Now.',
        tag: `enter-now-${clientId}-${cueNumber}`,
        cue: true,
        cueNumber
      });
      kept.push(subscription);
    } catch (err) {
      if (err.statusCode !== 404 && err.statusCode !== 410) kept.push(subscription);
    }
  }
  const all = loadSubscriptions().filter(s => s.clientId !== clientId);
  saveSubscriptions(all.concat(kept));
}

function scheduleNext(clientId) {
  const session = sessions.get(clientId);
  if (!session || !session.running) return;
  const min = Math.max(0.1, Number(session.min) || 5);
  const max = Math.max(min, Number(session.max) || min);
  const delay = (min + Math.random() * (max - min)) * 60000;
  session.timer = setTimeout(async () => {
    const current = sessions.get(clientId);
    if (!current || !current.running) return;
    current.cues += 1;
    await sendCue(clientId, current.cues);
    scheduleNext(clientId);
  }, delay);
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  pushConfigured: !!(publicKey && privateKey),
  activeSessions: sessions.size
}));

app.get('/vapid-public-key', (_req, res) => {
  if (!publicKey) return res.status(503).json({ error: 'Push server is not configured.' });
  res.json({ publicKey });
});

app.post('/subscribe', (req, res) => {
  const { subscription, clientId } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys || !clientId) {
    return res.status(400).json({ error: 'Subscription and clientId are required.' });
  }
  const subscriptions = loadSubscriptions();
  const normalized = { ...subscription, clientId };
  const existing = subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
  if (existing >= 0) subscriptions[existing] = normalized;
  else subscriptions.push(normalized);
  saveSubscriptions(subscriptions);
  res.status(201).json({ ok: true });
});

app.post('/unsubscribe', (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required.' });
  saveSubscriptions(loadSubscriptions().filter(s => s.endpoint !== endpoint));
  res.json({ ok: true });
});

app.post('/start-session', (req, res) => {
  if (!publicKey || !privateKey) return res.status(503).json({ error: 'Push server is not configured.' });
  const { clientId, min, max } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId is required.' });
  const old = sessions.get(clientId);
  if (old?.timer) clearTimeout(old.timer);
  const session = {
    id: crypto.randomUUID(), running: true,
    min: Number(min) || 5, max: Number(max) || Number(min) || 5,
    cues: 0, startedAt: Date.now(), timer: null
  };
  sessions.set(clientId, session);
  scheduleNext(clientId);
  res.json({ ok: true, sessionId: session.id });
});

app.post('/stop-session', (req, res) => {
  const { clientId } = req.body || {};
  const session = sessions.get(clientId);
  if (session?.timer) clearTimeout(session.timer);
  sessions.delete(clientId);
  res.json({ ok: true });
});

app.post('/send-test', async (_req, res) => {
  if (!publicKey || !privateKey) return res.status(503).json({ error: 'Push server is not configured.' });
  const subscriptions = loadSubscriptions();
  let sent = 0;
  const kept = [];
  for (const subscription of subscriptions) {
    try {
      await sendToSubscription(subscription, {
        title: 'Enter Now', body: 'Beep-Boop — Enter Now test.',
        tag: `enter-now-test-${Date.now()}`, cue: true
      });
      sent += 1; kept.push(subscription);
    } catch (err) {
      if (err.statusCode !== 404 && err.statusCode !== 410) kept.push(subscription);
    }
  }
  saveSubscriptions(kept);
  res.json({ sent, total: subscriptions.length });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Enter Now push server listening on ${port}`));
