# Verification record

Verified locally on **Ubuntu 24.04.4 LTS**, Node **22.23.2**, npm **10.9.8**, using Chromium through Playwright. Date: **2026-11-02**.

| Check | Result |
|---|---|
| `npm test` | 22 passing engine, storage and adapter tests |
| `npm run test:e2e` | 7 passing browser/API workflow tests |
| `npm run build` | TypeScript check and production Vite build pass; charts load as a separate bundle |
| `npm run migrate` | Local schema and zero-completion seed created successfully |
| `bash -n scripts/install-service.sh` | Shell syntax passes; service installation not performed |
| Compiled `npm start` smoke check | API and separate scheduler start; production page and lazy charts load |
| Desktop/mobile screenshots | Captured in `docs/preview-desktop.png` and `docs/preview-mobile.png` from the real empty local profile |

## Deterministic and storage coverage

- Kathmandu's +05:45 offset, noon/midnight, month/year rollover, DST offset changes, ambiguous/nonexistent times, overnight DST windows, template timezone independent of profile date.
- Opening and grace boundaries, zero grace, strict expiry, repeated scheduler execution, duplicate clicks, correction note validation, one-time reversal, undo/recomplete without lifetime-XP farming.
- XP/HP/category caps and floors, optional/paused/rest behavior, nutrition/body-weight penalty protection, custom bounded rewards, daily recovery order after an overnight shutdown.
- Long-gap review/excuse, unique occurrence materialization, no pre-creation occurrences, closed-week achievements and repeat protection.
- Seven-calendar-day sparse weight average, sample counts and null gaps.
- Versioned backup roundtrip, duplicate key rejection, validated prototype import and desk-hour conversion without invented XP.
- Four real child processes competing for SQLite completion writes: exactly one lifetime/current XP award.
- Local fixture HTTP provider for AI: JSON schema in prompt, privacy payload, output/workload rejection, explicit consent and daily request limit. No live provider inference.
- OAuth authorization URL scope/PKCE and invalid-state rejection without exchanging tokens; notification queue quiet hours/dedup; stable ICS UTC output.

## Browser and API workflows

1. Complete → reload → another tab → concurrent duplicate requests → undo/recomplete, with one lifetime award.
2. Create/edit/duplicate/archive templates and reschedule a dated quest.
3. Expire/correct with audit note; save measurements; inspect chart table; edit settings; preview and restore a backup without another award.
4. Mobile navigation, persistent timer pause/reload/resume, no horizontal overflow, no page exceptions, visible offline write error and honest reconnect state.
5. Missing local header, cross-origin write, malformed template and malformed backup rejected.
6. Two competing browser notification claims return one job; failed acknowledgement is visible; repeated ICS exports retain UIDs; disabled AI rejects requests.
7. Independent scheduler expires a quest with no browser page open; the read-only backup endpoint observes one persisted expiry ledger entry.

The Playwright database is isolated at `data/e2e/level-up.sqlite`; its backup directory is separate from the normal profile. Tests never award fake XP or insert measurements into `data/level-up.sqlite`. Browser tests use controllable backup fixtures to make windows deterministic; engine tests inject timestamps and do not sleep for deadlines.

## Not verified with real external systems

Google consent/token exchange, Google event delivery, real AI inference, actual Ubuntu notification display, systemd installation/startup in a desktop login, and Web Push delivery need user configuration or a real graphical/provider environment. Mock/adapter tests are not claims of successful live connections. No deployment, remote account, hosted authentication or remote scheduler was created. Accessibility was exercised through labelled keyboard-compatible controls, browser workflows and responsive checks, not a full assistive-technology audit.
