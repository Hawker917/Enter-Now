// Enter Now Web Push server
// Node 18+. Install: npm install express web-push
// Generate VAPID keys once with: npx web-push generate-vapid-keys
// Store the resulting keys in VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.

const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '64kb' }));

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

app.get('/health', (_req, res) => res.json({ ok: true, pushConfigured: !!(publicKey && privateKey) }));
app.get('/vapid-public-key', (_req, res) => {
  if (!publicKey) return res.status(503).json({ error: 'Push server is not configured.' });
  res.json({ publicKey });
});

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  const subscriptions = loadSubscriptions();
  const existing = subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
  if (existing >= 0) subscriptions[existing] = subscription;
  else subscriptions.push(subscription);
  saveSubscriptions(subscriptions);
  res.status(201).json({ ok: true });
});

app.post('/unsubscribe', (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint required.' });
  saveSubscriptions(loadSubscriptions().filter(s => s.endpoint !== endpoint));
  res.json({ ok: true });
});

app.post('/send-test', async (_req, res) => {
  if (!publicKey || !privateKey) return res.status(503).json({ error: 'Push server is not configured.' });
  const payload = JSON.stringify({ title: 'Enter Now', body: 'Beep-Boop — Enter Now.', tag: 'enter-now-test', sound: true });
  const subscriptions = loadSubscriptions();
  const kept = [];
  const results = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: 'high' });
      kept.push(subscription);
      results.push({ ok: true });
    } catch (err) {
      results.push({ ok: false, statusCode: err.statusCode || 500 });
      if (err.statusCode !== 404 && err.statusCode !== 410) kept.push(subscription);
    }
  }
  saveSubscriptions(kept);
  res.json({ sent: results.filter(r => r.ok).length, total: subscriptions.length, results });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Enter Now push server listening on ${port}`));
