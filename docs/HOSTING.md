> For the supported Node/SQLite Render deployment, see [RENDER.md](RENDER.md). The research below describes the original local build and a separate potential Cloudflare port.

# Hosting research — no deployment

Checked against official documentation on **2026-11-02**. This delivery is local-only. No provider registration, account creation or deployment was performed.

Cloudflare is a plausible future target after a storage/authentication/worker port, not a drop-in host for this local Node/SQLite build:

| Component | Documented free allocation / constraint | App implication |
|---|---|---|
| Workers | 100,000 requests/day; 10 ms CPU/invocation on Free | API and scheduled reconciliation must be bounded and measured. [Official pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| D1 | 5 million rows read/day, 100,000 rows written/day, 5 GB total storage on Free | Use incremental queries and writes, not this local snapshot-oriented repository unchanged. [Official D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Scheduled work | Cron Triggers invoke a scheduled Worker handler; scheduling is UTC and changes can take time to propagate | Keep IANA recurrence in the domain layer; implement an idempotent remote worker. [Official Cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) |
| Signup | Workers product page advertises starting free without a credit card | This is a published offer, not a guarantee that every future product/account has identical requirements. [Official product page](https://www.cloudflare.com/products/workers/) |

A free static site alone does not provide a persistent database, authenticated ownership, scheduled expiry or reliable closed-tab reminders. A Web Push service worker needs a server sender and VAPID secrets. Optional LLM API costs are separate; no free API entitlement is assumed. Local Ollama still needs running hardware.

Before any future deployment: implement authenticated owner IDs and enforce them in every API/database query; port the repository to persistent remote storage; replace the local timer process with a provider scheduled worker; add HTTPS/session protection, managed secrets, backup/retention policy and provider-level observability. Recheck quotas and account eligibility. Do not copy SQLite onto ephemeral serverless disk, expose the current local server publicly, or claim an obscure URL is authentication.

Recharts was selected using its [official ResponsiveContainer](https://recharts.github.io/api/ResponsiveContainer/) and [LineChart](https://recharts.github.io/api/LineChart/) documentation. The app provides explicit chart containers, null gaps, labels/tooltips and data tables.
