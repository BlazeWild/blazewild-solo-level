# Level Up · Asok

A private life dashboard built with React, TypeScript, Vite, a Node API, Neon Postgres, Gemini, and Recharts. Render hosts the stateless web process; Neon stores the owner state and photo proof.

## Deploy on Render

See [the Render deployment guide](docs/RENDER.md). `render.yaml` configures the web service, owner-only authentication, Neon connection, and server-side Gemini integration.

## Run on Ubuntu

Node **22 LTS (22.13 or later)** or Node 24 LTS is required. This build was tested with Node 22.23.2 and npm 10.9.8. Dependencies are locked in `package-lock.json`.

```bash
cd /home/blaze/Documents/Windows_Backup/Ashok/_AI/ASHOK_LEVEL_UP_AGENT/Asok_Level_Up_Codex_Kit/level-up-codex
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. One command runs the client and API; the scheduler runs inside the API process. `DATABASE_URL` is required. Neon is initialized and the routine is seeded automatically on first run, with **zero claimed completions**.

For the compiled local app:

```bash
npm run build
npm run migrate
npm start
```

Open **http://127.0.0.1:3001**. Both API and scheduler run independently of the browser. Do not run dev and production simultaneously on the same ports. By default the server binds to `127.0.0.1`. Hosted mode binds to `0.0.0.0` and requires an owner username/password; see the Render guide.

## Feature checklist

- [x] Today: live countdown, dated quest windows/status, complete/undo/correct/excuse, snooze, persistent start/pause/resume timer, progress, flexible five-day cycle and fatigue-aware evening guidance.
- [x] Quest templates: create, edit, duplicate and archive; daily/selected-weekday/one-time recurrence, IANA timezone, target, difficulty, grace, reminder lead, optional/required, bounded penalties. Nutrition and body-weight habit types never incur penalties.
- [x] Timeline: day/week agenda, drag to another day, keyboard-accessible reschedule form, rest dates, stable-UID `.ics` snapshot export.
- [x] Character: lifetime and spendable XP, levels, custom rank titles, virtual HP, streak, weekly achievements, six game scores and reversible ledger.
- [x] Progress: 7/30/90-day charts, table alternatives, sparse measurements, seven-calendar-day weight average with sample counts, waist, manual steps/target, sleep, desk hours, daily pull-up total, handstand, quest trend, XP/HP changes and balances, habit radar.
- [x] Nutrition/recovery: meal drafts, actual food notes and provenance, hygiene/hair/meditation/sleep habit types, balanced-food and recovery guidance without invented nutrient totals.
- [x] Settings: personal baseline, work/lunch/wake preferences, weekdays, rotation anchor/offset, independent desk progression week, step goal, ranks, rest/vacation dates, soft/paused penalties, quiet hours/focus, channels and integrations.
- [x] Weekly review: deterministic wins, missed categories, current/previous week comparison and realistic adjustments; no LLM needed.
- [x] Neon-backed owner state, private records and photo proof; overdue reconciliation, audit records, versioned backup/restore preview and automatic pre-import backup.
- [x] Browser reminders, persistent scheduler jobs, optional Ubuntu desktop delivery, Web Push adapter, diagnostic status and test notification.
- [x] Optional Google Calendar OAuth with state/PKCE and encrypted refresh tokens; explicit one-way sync to a separate calendar.
- [x] Optional OpenAI-compatible / Ollama proposal adapter, consent, output validation, workload/collision filters, daily request limit and explicit review before creation.

## Important behavior

- Difficulty rewards are easy +10, normal +20, hard +30. Levels use lifetime XP: `1 + floor(lifetime / 200)`. Undo/correction is audited; undo reverses spendable/HP/category effects but does not erase lifetime earned XP. Re-completing the same quest cannot farm lifetime XP.
- Completion is valid from opening through due + grace **inclusive**. Expiry is strictly later. Server time is used for normal completion. Correction records a claimed actual time and note. This local app is honest self-tracking, not cheat-proof.
- Standard penalties: at most 5 XP/HP per required quest and 20 of each per local date, floor zero. Soft mode: at most 2 per quest and 10/day. Category loss is capped at 2/day/category. Optional, excused, cancelled, nutrition and body-weight habits do not incur penalties.
- Daily HP recovery is +10, capped at 100, once per local date. Resume reconciliation applies expired prior dates before later recovery. A gap over three days pauses new reconciliation until reviewed. Apply mode penalizes only the latest three days; older overdue quests are excused. Excuse mode excuses the absence.
- Weekly achievement: closed ISO week, ≥80% completed required eligible quests and ≥3 eligible days, +50 XP once. Open weekly review considers resolved quests, labels its denominator, and excludes upcoming quests. Empty denominator is no data.
- Recurrence stores local rules and UTC instances. DST ambiguous times use the earlier instant; nonexistent spring-forward times move forward by the gap. Overnight windows advance the local date, not a fixed UTC 24 hours.
- Templates materialize through 14 days ahead. Editing a template preserves already-materialized instances, including upcoming ones; use Timeline to edit those explicitly. Archive cancels open instances and preserves history. Changing personal work/lunch/timezone/grace preferences does not silently alter existing quest windows.
- Desk progression is deliberately manual: increment the progression week when ready, leave it unchanged to repeat. Actual desk hours are logged separately. Change rotation offset/anchor to hold or advance the five-day cycle independently. Rest dates excuse open quests.
- Notifications do not complete quests. Snooze changes only the reminder. Only one notification channel is active, and browser jobs are claimed transactionally across tabs. Delivery cannot be made exactly-once across an OS/network crash: interrupted sends are marked unknown and are not automatically replayed. Inspect diagnostics and send another explicit test if needed.
- Offline writes are **not queued** or silently accepted. A failed write shows an error. Reconnect, reload and use the visible on-time correction form with actual completion time and note. This policy avoids pretending a checkbox synced when it did not.

## Backup, restore and prototype import

Use **Settings → Export backup**, then select a file under **Preview backup / prototype import**. Review the counts before **Replace local data**. A validated replacement saves the previous state under `data/backups/pre-import-*.json` first. Credentials and push subscriptions are not exported; local provider connections remain on this machine.

CLI equivalents:

```bash
npm run backup
npm run restore -- /absolute/path/to/backup.json
# Review the counts, then apply:
npm run restore -- /absolute/path/to/backup.json --apply
```

The prototype's exported `{settings, days, skills}` format is supported. Weight, sleep, steps and skill measurements are validated; desk hours become minutes. Untimed legacy checkmarks are preserved in the audit but do not invent timed completions or XP. Export from the original site's Settings first; localStorage on a different origin is not readable by this app. An old backup intentionally replaces newer tracking state. Backups contain personal data: store them privately.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start their own API/client/scheduler using an isolated test database. Stop any normal dev server before running them. Tests include boundaries, Kathmandu/DST, strict grace, retries, concurrent processes, undo/correction, daily caps and rollover, weekly rewards, long gaps, import validation, sparse averages, CRUD, archive, reschedule, charts, settings, mobile navigation, timer persistence, offline failures, notification claims and ICS stability. See [docs/TESTING.md](docs/TESTING.md).

## Optional setup and hosting status

See [docs/UBUNTU.md](docs/UBUNTU.md) for user services and desktop reminders, [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for Google/AI/push configuration, and [docs/HOSTING.md](docs/HOSTING.md) for verified provider quotas and the additional architecture required before hosting.

No Google credentials, AI endpoint/model, VAPID keys or desktop graphical-session binding were supplied. These adapters are implemented but **real provider delivery/OAuth/inference has not been verified**. They remain disabled or visibly unconfigured until setup. Systemd installation is supplied as an optional script; it has not been installed or enabled on your behalf. The hosted authentication/database/scheduled-worker migration is future work; do not expose this local server publicly.
