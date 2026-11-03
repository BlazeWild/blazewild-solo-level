# Deploy Level Up on Render

This is a single-owner app. Render hosts the stateless web process; Neon is the authoritative database for game state, private records, and photo proof. Hosted mode uses an owner-only login and a signed, HTTP-only, SameSite=Strict cookie over Render HTTPS.

## Recommended: Blueprint

1. In https://dashboard.render.com choose **New → Blueprint** and connect `BlazeWild/blazewild-solo-level` (branch `main`).
2. Render reads the root `render.yaml`. Enter `AUTH_PASSWORD` (at least 20 unique characters) and `GEMINI_API_KEY`. Render generates `SESSION_SECRET`.
3. Review the paid web-service and 1 GB disk charges shown by Render, then deploy.
4. Open the service's HTTPS URL and use the owner login form. There is no sign-up route.

Do not set `APP_URL` for the default Render domain: the server automatically uses `RENDER_EXTERNAL_URL`. If adding a custom domain, set `APP_URL` to its exact HTTPS origin and use that domain to access the app.

## Manual: New → Web Service

Connect the same repo and enter:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | Leave blank |
| Language | Node |
| Region | Singapore (or your preferred region) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Instance | Any suitable Node web-service plan |
| Health check | `/api/health` |

Environment variables:

```text
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=<your pooled Neon connection string>
AUTH_USERNAME=ashok
AUTH_PASSWORD=<your unique password, at least 20 characters>
SESSION_SECRET=<random value, at least 32 characters>
GEMINI_API_KEY=<your server-side Gemini key>
GEMINI_MODEL=gemini-3.8-flash
DESKTOP_NOTIFICATIONS=false
```

The `.nvmrc` selects Node 22. Render supplies `PORT` and `RENDER_EXTERNAL_URL`; do not hardcode a localhost URL. Keep dev dependencies installed: the build uses TypeScript/Vite and the start command uses `tsx`. Neon tables and defaults are initialized at startup.

## Data, reminders and integrations

- Neon stores the data; do not add a Render disk. Keep one web-service instance because the in-process scheduler is intentionally single-owner and idempotent.
- Local data and secrets are excluded from GitHub. To transfer existing progress, export a JSON backup from the local app, then use Settings → Preview backup / prototype import on the hosted app and review before replacing data. Export backups periodically and store them outside Render.
- Browser reminders require an open app and browser permission. Ubuntu desktop notifications are unavailable on Render. For closed-tab notifications, configure VAPID credentials as described in [INTEGRATIONS.md](INTEGRATIONS.md).
- Google Calendar is optional. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a stable 64-hex-character `TOKEN_ENCRYPTION_KEY`, and `GOOGLE_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/api/calendar/callback`. Register that exact callback in Google. Also set `APP_URL` to your public HTTPS origin so the callback redirects there.
- AI is optional. Configure a remotely reachable `AI_ENDPOINT`, `AI_MODEL`, and any required `AI_API_KEY` in Render environment settings. Your laptop's localhost/Ollama endpoint is not reachable from Render.
- The owner login is shared across your devices, not a multi-user account system. The secure cookie lasts 30 days. Rotate `SESSION_SECRET` to revoke every existing session immediately; rotate `AUTH_PASSWORD` if the password is exposed.

## Verify the deployment

The build should finish successfully, `/api/health` should return `{"ok":true}`, and opening the app should prompt for login. Save a change, restart the Render service, and confirm it remains. A 401 means credentials are missing/incorrect; a cross-origin 403 means `APP_URL` does not match the domain you opened. Logs should show the API listening on `0.0.0.0` and the scheduler running.

Official references: [Node deployment](https://render.com/docs/deploy-node-express-app), [web services](https://render.com/docs/web-services), [Blueprints](https://render.com/docs/blueprint-spec).
