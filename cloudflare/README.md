# Enter Now — free iPhone lock-screen push backend

This backend uses Cloudflare Workers + Agents + Durable Objects to store each device's Web Push subscription and schedule randomized Enter Now cues that survive a closed/locked browser session.

Apple supports Web Push for Home Screen web apps on iOS 16.4+ and does not require Apple Developer Program membership.

## One-time deployment

1. Create a free Cloudflare account.
2. Install Node.js 18+ and Wrangler.
3. From this directory run:

```bash
npm install
npx wrangler login
```

4. Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

5. Store the three values as Worker secrets:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Use a `mailto:` subject for `VAPID_SUBJECT`.

6. Deploy:

```bash
npm run deploy
```

Cloudflare will provide a `workers.dev` URL. The Enter Now web client will use that URL as its push backend.

## Why this architecture

Cloudflare Agents provide durable scheduling backed by Durable Objects/SQLite. A scheduled task can wake the agent even when the user's browser is closed, and the agent sends a Web Push notification through the browser's push endpoint. This avoids relying on JavaScript timers or audio playback continuing on a locked iPhone.

## Production notes

- Keep the VAPID private key secret. Never put it in the website code.
- The public VAPID key is safe to send to the browser.
- Invalid/expired push endpoints (404/410) are automatically removed.
- Temporary push failures are retained for retry on the next scheduled cue.
- The web client should use one Agent instance per user/device identity rather than a global shared session.
