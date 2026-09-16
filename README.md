# DearSelf Web Push Server — V44.3

This version removes the shared `API_KEY`.

Instead, a device is identified by its own Web Push subscription. Its
subscription and reminder schedule are stored together, so one person's
schedule is not accidentally sent to every registered device.

## Environment

Required:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Optional:

- `VAPID_SUBJECT`
- `PORT`

Generate VAPID keys once:

```bash
npm install
npx web-push generate-vapid-keys
```

Keep the **private** key only in the server environment. The public key is
safe for the PWA.

## Deploy

The server must be reachable over HTTPS for the PWA.

Set the environment variables in your host (Render, Railway, VPS, etc.) and
run:

```bash
npm start
```

Do NOT put the private VAPID key, or any server secret, in `index.html`.

## Frontend

The PWA needs only:

```js
const DS_PUSH_SERVER = 'https://YOUR-PUSH-SERVER.example.com';
```

The frontend obtains the public VAPID key from:

`GET /api/vapid-public-key`

Then it sends its own subscription with `/api/subscribe` and `/api/schedule`.

There is deliberately no shared API key in the browser.

## Notification coverage

The central scheduler should register all DearSelf features that currently
have notification settings:

- Study sessions
- Timetable classes
- Assignments
- Exams
- Calendar events
- Tasks / To-do
- School To-do

The client should generate multiple future timetable occurrences rather than
only the next class, so recurring classes continue working while DearSelf is
closed.

## Security notes

- HTTPS is required.
- VAPID private key stays server-side.
- Subscription records are separated per device.
- Schedule payloads are validated and capped.
- Old/expired push subscriptions are removed after 404/410 responses.
- CORS reflects the requesting origin rather than using a wildcard.
- The server no longer has a global `schedule.json`.

This is safer than the old shared API key because there is no reusable
frontend secret. It is still important to rate-limit the server at the
hosting/reverse-proxy layer if the service becomes public.
