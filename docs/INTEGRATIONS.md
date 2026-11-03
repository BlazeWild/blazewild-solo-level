# Optional integrations

Local core needs no credentials. Copy `.env.example` to `.env` only when configuring providers; restart API and scheduler after changes. Never use a `VITE_` prefix for secrets, since that exposes them to client bundles.

## Google Calendar

1. In a Google Cloud project, enable Google Calendar API and configure the OAuth consent screen. Add your own Google account as a test user when the app is in testing.
2. Create a web OAuth client. Register this exact authorized redirect URI: `http://127.0.0.1:3001/api/calendar/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and `TOKEN_ENCRYPTION_KEY` in `.env`. Generate the 32-byte encryption key with `openssl rand -hex 32`; save it privately. Changing/losing it requires reconnecting Google.
4. Set `APP_URL=http://127.0.0.1:5173` for development, or `http://127.0.0.1:3001` for compiled local operation.
5. Restart. In Settings click **Connect Google** and authorize. Select export/sync categories, save settings, then click **Sync now**. This explicit action creates a separate **Level Up** calendar and writes selected quests. It never adds invitees or edits unrelated calendars.
6. Use **Disconnect & revoke** to revoke credentials and remove locally stored tokens. Existing calendar events remain in Google; remove the dedicated calendar there if desired.

The adapter requests `https://www.googleapis.com/auth/calendar.app.created`, which covers secondary calendars created by the application. OAuth state and PKCE protect the callback; refresh tokens use AES-256-GCM encryption in SQLite. See Google's [scope documentation](https://developers.google.com/workspace/calendar/api/auth). Testing-mode OAuth refresh tokens may expire according to Google's project policies; reconnect if authorization expires.

Sync is explicit, one-way and idempotent, with stored calendar/event IDs and deterministic event IDs. A conflict from an already-created event is updated instead of duplicated. Failed/rate-limited requests surface an error; retry **Sync now** after the provider allows it. There is no automatic polling or two-way sync. External edits never complete a quest. OAuth and actual Google writes were not exercised without your credentials.

The downloadable `.ics` works without Google credentials. It uses stable UIDs and UTC instants derived from the quest's IANA timezone. It is a snapshot, not live synchronization. Some calendar clients duplicate repeated manual imports despite stable UIDs; import into a dedicated calendar you can replace.

## Optional AI proposals

The server accepts an OpenAI-compatible chat-completions endpoint. Configure the complete URL and model yourself:

```dotenv
AI_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
AI_MODEL=your-installed-model
AI_API_KEY=
```

This example points to a separately installed Ollama server exposing its compatibility endpoint. No model is installed by this app, and no inference was run during development. For another compatible provider, supply its HTTPS endpoint/model and optional API key. Keep keys server-side. Check the provider's usage/pricing yourself; compatibility does not mean free usage. Local inference consumes your machine's resources. A future hosted browser/server cannot assume it can reach your laptop's localhost.

Enable AI in Settings, then use **Quests → Consent & request proposals**. Each request sends only wake/work times and predefined preferences (meditation, hygiene, study, balanced meals), never personal name, weight, skill history or logs. Five requests per UTC date, 20-second timeout, maximum two proposals, JSON-only output validated with a strict Zod schema: title, category, difficulty, duration, start/end window, reason and recovery alternative. Output is constrained to easy 5–20-minute non-training habits, checked against routine collisions and recovery restrictions. Unsafe/invalid responses produce visible errors and leave your routine intact. The schema is in `server/integrations.ts`.

Review a proposal in the ordinary quest editor and explicitly save it. The LLM has no tool access to scores, credentials, calendars or penalties. Disable AI in Settings to block subsequent requests. Deterministic weekly review works regardless of provider availability.

## Web Push adapter

Generate a VAPID key pair locally:

```bash
npx web-push generate-vapid-keys
```

Put the public/private values and a real `mailto:` contact in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Restart, explicitly grant browser permission, choose **push**, save settings, then **Subscribe to Web Push** and **Send test notification**. Browsers treat localhost as a secure development context; a hosted version needs HTTPS. The adapter supports the standard Google, Mozilla and Apple push endpoints.

`public/sw.js` displays received pushes and opens the app when clicked. A service worker cannot wake itself at an arbitrary scheduled time: the running local scheduler submits pushes. A hosted version must replace it with a durable server scheduler. Delivery is best-effort, depends on browser/OS/network policy, and is not proof of completion. Secrets and subscriptions are not included in tracking backups. Real push delivery remains unverified without keys and a granted subscription.
