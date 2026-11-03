# Level Up — product requirements

## Scope and current delivery
The supplied ui/ is runnable HTML/CSS/JavaScript with localStorage, checkboxes, simple XP, routine guidance, basic logs and open-tab notifications. Everything below describes the expanded app to build. Existing logs should have a validated migration/import path. Do not change the existing hosted site.

## My routine and goals
- Name Asok; timezone Asia/Kathmandu. Age 23, height 174 cm, recent weight 78–79 kg; goal around 70 kg with strength retained. These are user-reported starting values, not new measurements. Make all editable.
- Work 10:00–18:30, movable one-hour lunch. Wake 07:45; morning training 08:00–09:00.
- Preserve my repeating five-day cycle: push, pull, legs, arms/dominant muscle, basketball/active recovery. Not a Monday–Sunday split. Allow missed days, extra rest and manual rotation changes independently of the desk progression start.
- After work at 18:30: 10–15 minutes of handstand technique, easy pull-up practice, walking, stretching or mobility. One activity, not another hard workout. Adapt to fatigue and the morning session.
- Five-minute breaks approximately hourly; snooze, quiet hours and focus mode; walking on terrace, gentle mobility and optional easy pull-ups when recovered. Avoid extra pulling on pull/arms days.
- Start working at desk from 10:00 until lunch. Gradually add 30 minutes/week after lunch; allow repeating a week. Track actual desk minutes independently of elapsed calendar weeks.
- Lunch walk 15–20 minutes. Editable step goal starting around current baseline + 1,000; never pretend a laptop automatically measures steps.
- Food habits, meal planning, hygiene, hair care, meditation, sleep and skills are trackable categories. Two eggs/day; chicken 3–4 times/week; soy, chickpeas, vegetables and rice are available. Do not auto-prescribe crash diets or assert precise nutrition without food labels/quantities. Retain balanced-food guidance in prototype.

## Main screens
1. Today: next quest/countdown, time windows, live status, start/pause timer, completion, snooze, XP/HP bars, rank, daily summary and workout cycle.
2. Quest editor: title, description, category, difficulty, recurrence, timezone, start/end window, grace period, completion target, reminders, reward and bounded penalty. CRUD, duplicate, archive; separate templates and dated instances.
3. Timeline/calendar: daily/weekly agenda, drag/reschedule, recurring routines, rest-day mode, upcoming deadlines.
4. Character: level, rank title, avatar placeholder, virtual HP, streaks, achievements and six habit scores: Strength, Mobility, Endurance, Focus, Recovery, Consistency. Explicitly label scores as game metrics, not measured physiology.
5. Progress: weight line with 7-calendar-day rolling average and sample count; waist; step bars with target; sleep; desk minutes; pull-up repetitions and handstand seconds; quest completion trend; XP/HP history; habit radar and weekly comparison. 7/30/90-day filters. Missing data is null, never zero. No fake history except an explicitly labelled optional demo mode.
6. Nutrition/recovery: meal templates and optional actual food logging with provenance; gentle habit goals, no penalties for eating or body weight.
7. Settings: timezone, rotation anchor, work/lunch times, weekday schedule, notification channels, penalty mode, grace period, rest/vacation days, privacy, integration status, export/import.
8. Weekly review: wins, missed categories, realistic next-week adjustments, transparent score breakdown. Deterministic without an LLM; optional AI explanation.

## Exact quest lifecycle
States: scheduled -> available -> completed OR missed; also excused/cancelled. Store UTC instants plus IANA timezone and local recurrence rule. Materialize dated instances with uniqueness (template_id, occurrence). Editing a template must not silently rewrite historical instances.
Completion is valid within [opens_at, due_at + grace] inclusive. A scheduler marks a still-open instance missed only when now > due_at + grace. Default grace 15 minutes; configurable to zero for strict mode. If not ticked in time, mark missed and apply the game penalty exactly once, even if the app was closed. Reconcile overdue instances when service resumes. Avoid penalizing dates before account/plan creation.
Allow a visible 'I did this on time; forgot to log it' correction with actual completed_at, note and audit entry. Reverse the original penalty exactly once; never silently rewrite history. Allow excused illness/rest and undo accidental checkmarks. Trusted-server time in hosted mode; local mode is honest self-tracking, not cheat-proof. Offline completion must record claimed time and sync policy explicitly.
Notification sent/delivered is not completion. Notification failure should be visible. Snoozing a reminder does not extend a deadline unless explicitly rescheduled. Deduplicate reminders and expiry across tabs, retries and restarts. Restore must not double-award rewards.

## Game rules — configurable proposed defaults
- Difficulty: easy +10 XP, normal +20, hard +30; verified in code, shown before acceptance.
- Cumulative lifetime earned XP never decreases. Spendable/current progression XP may lose 5 for a missed required quest, with max 20 XP penalty/day and floor 0. Clearly display both; levels use lifetime XP so missed checkboxes do not erase earned levels.
- Level = 1 + floor(lifetime XP / 200). Rank proposals: E / Awakening (1–4), D / Apprentice (5–9), C / Hunter (10–19), B / Elite (20–34), A / Vanguard (35–49), S / Monarch (50+). These are app-defined titles, not a claim of canon accuracy. Allow custom titles.
- Virtual HP starts 100; missed required quest -5, max -20/day; daily rollover +10 once per local date, cap 100. Completion +2 HP once, cap 100. HP 0 gives a 'reset day' UI, never disables functionality or demands punishment. HP is not health status.
- Category points: +1/+2/+3 on completion according to difficulty; missed required quest -1 within that category, daily category loss cap 2 and floor 0. Show a reversible ledger and derive scores from it.
- Optional quests have no penalty. Rest/excused/cancelled quests have no penalty and do not damage streaks. Weekly consistency = completed / eligible required quests, excluding excused/cancelled. Define empty denominator as no data, not 100%.
- Weekly achievement at >=80% completion and at least three eligible days; award +50 XP once per local ISO week. No reward for rapid weight loss or extra unscheduled training.
- Penalties are virtual only. Never prescribe food restriction, sleep deprivation, pain, extra punishing workouts, monetary loss or shame. Include a softer mode and a pause. Avoid unlimited penalties accumulating during illness or prolonged absence; show an audited reconciliation preview after long gaps.
- Event ledger with unique idempotency keys (quest completion, expiry, correction, daily recovery, weekly reward). Transactional writes; concurrency-safe completion vs expiry. Completion at the exact grace boundary wins.

## Data/API
Tables: profile/settings, quest_templates, quest_instances, completion_events, score_ledger, daily_logs, skill_logs, notification_jobs/delivery_attempts, push_subscriptions, integration_connections, calendar_event_mappings, audit_events. Every row belongs to authenticated owner in hosted mode.
API: quest CRUD, complete/correct/excuse/reschedule, daily and skill logs, aggregated stats, settings, backup export/import, scheduler reconcile, notification test, calendar connect/disconnect/sync, optional AI quest proposals. Validate input and ownership server-side. Version backups, validate imports, preview replacements and keep a pre-import backup.
Use database transactions and unique constraints. Keep migration files and seed a realistic schedule with zero claimed completions. Unit tests use controllable clocks, not wall-clock sleeps.

## Notifications — three distinct modes
A. Included static UI: browser Notifications API while tab runs. No reliable closed-tab scheduling; tab suspension/OS sleep can delay. Timer state currently resets on reload; improve it.
B. Ubuntu full app: independent local scheduler service persists jobs in SQLite; optional systemd --user service/timer and notify-send desktop notifications. Document graphical-session environment requirements, startup/restart, logs, disable/uninstall and laptop sleep behavior. Bind localhost by default. Local server must run for closed-tab alerts. Never promise notifications while powered off/asleep; reconcile afterwards.
C. Hosted app: HTTPS PWA with service worker + Web Push subscriptions + server scheduler + VAPID secrets. Service workers alone cannot wake at arbitrary scheduled times. Push is best-effort; browser/OS permissions, closed-browser behavior and network affect delivery. Provide test notification and diagnostic status; no guarantee of exact-minute delivery. Prevent duplicate tab and push notifications.
Use requestPermission only on an explicit user click. Quiet hours, reminder lead time, due-time reminder, snooze and timezone are editable. Do not enable intrusive sounds by default.

## Calendar API (optional)
- The app database is authoritative for quests/completion/game scores; calendar is scheduling and reminders, not evidence of completion.
- Start with downloadable .ics for manual import, stable UIDs and timezone handling. Explain it is a snapshot, not automatic sync; avoid repeated-import duplicates.
- Add optional Google Calendar OAuth through backend. Use least-privilege appropriate scopes after consulting current official docs, state/PKCE where applicable, secure refresh tokens, disconnect/revoke and no tokens in frontend bundles or logs.
- Create/use a separate Level Up calendar after user action; sync only selected quest categories to avoid flooding with every five-minute break. Never modify unrelated calendar events or add invitees.
- Default one-way app-to-calendar with stored external IDs and idempotent update/delete. Track sync failures/retries and rate limits. External edits do not mark quests complete. Optional two-way later requires explicit conflict rules.
- No Google sign-in required for local core. Hosted app must have authentication; an obscure URL is not access control.

## Optional LLM
Disabled by default. Support a server-side provider adapter for an OpenAI-compatible endpoint and optional local Ollama. Hosted browser cannot assume access to laptop localhost. Keep secrets server-side; user configures endpoint/model. Local inference still uses compute; paid APIs are not automatically free.
Generate structured quest proposals with JSON schema: title/category/difficulty/duration/window/reason/recovery alternative. Show for user approval before creating anything. LLM never directly edits scores, penalties, credentials or calendar. Enforce deterministic workload limits, collision checks, exercise recovery rules and strict output validation. Prefer existing skills/food preferences rather than extreme fitness advice. Timeouts and failure fallback; no model required for core workflows. Explain what personal data is sent and let user choose. Include usage limits and disable switch.

## Delivery and verification
- Ubuntu one-command development start after dependency install; production local start, migrations, backup/restore and optional user service. .env.example contains placeholders only.
- Responsive accessible UI, keyboard navigation, form errors, reduced motion, clear contrast. Match supplied theme; gamified details without clutter.
- Charts include labels/tooltips/units and table alternatives. No calorie-burn fabrication from manual checkboxes.
- Verify month/year boundaries, Kathmandu offset, DST for other zones, noon/midnight, grace boundaries, double clicks, multiple tabs, worker retries, offline reopen, import and correction reversal. Prove no duplicate XP/HP/penalties.
- Verify free hosting options with official current documentation at build time. Distinguish free static UI from database, scheduled jobs, Web Push and LLM costs; document quotas and no credit-card assumptions. No deployment in this task without user request.
