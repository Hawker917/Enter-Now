# Enter Now — iPhone lock-screen push backend

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

Cloudflare will provide a `workers.dev` URL. During testing, set that URL in Enter Now's browser storage as `enterNowPushApi`, or define `window.ENTER_NOW_PUSH_API` before `push-client.js` loads.

The repository also contains `.github/workflows/deploy-cloudflare.yml`, which can deploy the worker after the required Cloudflare and VAPID secrets are added to the GitHub repository.

## What the browser does

The main Enter Now page registers the service worker, requests notification permission, obtains the public VAPID key from the Worker, creates a Web Push subscription, and sends that subscription to the Worker. Starting a session then creates a durable randomized schedule on the Cloudflare side.

Each browser gets a locally generated device identifier so its subscription and session are isolated from other Enter Now users. No name, email address, or account is required by this prototype.

## Why this architecture

Cloudflare Agents provide durable scheduling backed by Durable Objects/SQLite. Scheduled tasks survive agent restarts and can wake the agent later. The agent sends a Web Push notification through the browser's push endpoint, and the service worker displays the native notification. This avoids relying on JavaScript timers or audio playback continuing on a locked iPhone.

## Production notes

- Keep the VAPID private key secret. Never put it in website code.
- The public VAPID key is safe to send to the browser.
- Invalid/expired push endpoints (404/410) are automatically removed.
- Temporary push failures are logged and the session continues to schedule future cues.
- The current anonymous device ID is intentionally simple; a future paid product can add optional accounts if needed.
