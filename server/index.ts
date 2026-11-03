import "dotenv/config";
import express from "express";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import multer from "multer";
import { z } from "zod";
import { DateTime } from "luxon";
import { read, transaction, save, flush, putRecord, putProof, getProof } from "./store.js";
import {
  settingsSchema,
  templateSchema,
  logSchema,
  totals,
  localDate,
  type State,
} from "../domain/model.js";
import {
  act,
  reconcile,
  audit,
  materialize,
  progress,
} from "../domain/engine.js";
import { parseBackup } from "./backup.js";
import { queue, deliver } from "./notifications.js";
import * as integrations from "./integrations.js";
import { accessConfig, accessGuard, authHandlers, isAuthenticated } from "./access.js";
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => { res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"); res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); next(); });
const access = accessConfig(process.env);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use(express.json({ limit: "10mb" }));
app.get("/api/auth/session", (req, res) => res.json({ authenticated: isAuthenticated(access, req), hosted: access.hosted }));
const auth = authHandlers(access);
app.post("/api/auth/login", auth.login);
app.post("/api/auth/logout", auth.logout);
app.use(express.static(resolve("dist")));
app.use(accessGuard(access));
const now = () => new Date().toISOString();
app.get("/api/state", async (_req, res) => {
  transaction((s) => {
    reconcile(s, now());
    queue(s, now());
  });
  const s = read();
  res.json({
    ...s,
    totals: totals(s),
    integrations: {
      calendarConfigured: integrations.calendarReady(),
      calendarConnected: !!(await integrations.connection()),
      aiConfigured: !!(process.env.GEMINI_API_KEY || (process.env.AI_ENDPOINT && process.env.AI_MODEL)),
      pushConfigured: !!process.env.VAPID_PUBLIC_KEY,
      desktopConfigured: process.env.DESKTOP_NOTIFICATIONS === "true",
    },
  });
});
app.get("/api/stats", (req, res) => {
  const days = z.coerce
    .number()
    .refine((v) => [7, 30, 90].includes(v))
    .parse(req.query.days ?? 30);
  res.json(progress(read(), days, now()));
});
app.post("/api/templates", (req, res) => {
  const v = templateSchema.parse(req.body);
  const t = { ...v, id: randomUUID(), createdAt: now() };
  transaction((s) => {
    if (s.templates.length >= 2000) throw Error("Template limit reached");
    s.templates.push(t);
    materialize(s, now());
    audit(s, now(), "create-template", t.title);
  });
  res.status(201).json(t);
});
async function createDailyAdventure() {
  const day = localDate(now(), read().settings.timezone), existing = read().instances.find(q => q.occurrence === day && q.proofRequired && q.title.startsWith("Surprise quest:"));
  if (existing) return existing;
  const place = await integrations.randomAdventure();
  const value = templateSchema.parse({ title: `Surprise quest: ${place}`, description: `Visit ${place} safely, preferably in daylight, and upload a photo as proof. This optional quest stays open until 10:30 PM Nepal time.`, category: "Consistency", habit: "walking", difficulty: "easy", recurrence: "once", timezone: "Asia/Kathmandu", start: "06:00", end: "22:30", startDate: day, grace: 0, target: 1, reminderLead: 15, required: false, penalty: 0, archived: false, proofRequired: true });
  const t = { ...value, id: randomUUID(), createdAt: now() };
  transaction(s => { s.templates.push(t); materialize(s, now()); audit(s, now(), "adventure", t.title); });
  return t;
}
app.post("/api/adventure", async (_req, res) => {
  const t = await createDailyAdventure();
  res.status(201).json(t);
});
app.put("/api/templates/:id", (req, res) => {
  const v = templateSchema.parse(req.body);
  transaction((s) => {
    const t = s.templates.find((t) => t.id === req.params.id);
    if (!t) throw Error("Template not found");
    Object.assign(t, v);
    audit(
      s,
      now(),
      "edit-template",
      `${t.title}: existing dated instances preserved; edit individual windows in Timeline`,
    );
  });
  res.json({ ok: true });
});
app.delete("/api/templates/:id", (req, res) => {
  transaction((s) => {
    const t = s.templates.find((t) => t.id === req.params.id);
    if (!t) throw Error("Template not found");
    t.archived = true;
    for (const q of s.instances.filter(
      (q) =>
        q.templateId === t.id && ["scheduled", "available"].includes(q.status),
    ))
      q.status = "cancelled";
    audit(s, now(), "archive-template", t.title);
  });
  res.json({ ok: true });
});
app.post("/api/quests/:id/:action", (req, res) => {
  const input = z
    .object({
      completedAt: z.string().optional(),
      note: z.string().max(2000).optional(),
      opensAt: z.string().optional(),
      dueAt: z.string().optional(),
      minutes: z.number().int().min(1).max(120).optional(),
      value: z.number().int().min(0).max(100000).optional(),
    })
    .parse(req.body);
  transaction((s) => act(s, req.params.id, req.params.action, now(), input));
  res.json({ ok: true });
});
app.put("/api/settings", (req, res) => {
  const settings = settingsSchema.parse(req.body);
  transaction((s) => {
    const changedRotation = s.settings.rotationAnchor !== settings.rotationAnchor || s.settings.rotationOffset !== settings.rotationOffset;
    s.settings = settings;
    if (changedRotation) s.ledger.push({ id: randomUUID(), key: `rotation:${Date.now()}`, at: now(), date: localDate(now(), settings.timezone), kind: "rotation", lifetime: 0, xp: 0, hp: -Math.min(5, totals(s).hp), points: 0 });
    audit(
      s,
      now(),
      "settings",
      "Updated personal settings; existing quest windows retain their original timezone and grace.",
    );
  });
  res.json({ ok: true });
});
app.put("/api/logs", (req, res) => {
  const log = logSchema.parse(req.body);
  if (log.date > DateTime.now().setZone(read().settings.timezone).toISODate()!)
    throw Error("Measurements cannot be dated in the future");
  transaction((s) => {
    for (const old of s.ledger.filter((l) => l.key.startsWith(`sleep:${log.date}:`) && !l.reversed)) old.reversed = true;
    s.logs = s.logs.filter((l) => l.date !== log.date);
    s.logs.push(log);
    if (log.sleep !== null && log.sleep < 7) {
      const loss = Math.min(25, Math.ceil(2 * Math.pow(7 - log.sleep, 2)));
      s.ledger.push({ id: randomUUID(), key: `sleep:${log.date}:${Date.now()}`, at: now(), date: log.date, kind: "sleep", lifetime: 0, xp: 0, hp: -Math.min(loss, totals(s).hp), category: "Recovery", points: 0 });
    }
    audit(s, now(), "manual-log", log.date);
  });
  res.json({ ok: true });
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8_000_000 }, fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) });
app.post("/api/quests/:id/proof", upload.single("photo"), async (req, res) => {
  if (!req.file) throw Error("Choose a JPG, PNG, or WebP image under 8 MB");
  if (!read().instances.some(q => q.id === req.params.id)) throw Error("Quest not found");
  const id = randomUUID(); await putProof(id, String(req.params.id), req.file.mimetype, req.file.buffer);
  transaction((s) => { const q = s.instances.find(q => q.id === req.params.id); if (!q) throw Error("Quest not found"); q.proofUrl = `/api/proofs/${id}`; audit(s, now(), "photo-proof", q.title); });
  res.json({ ok: true });
});
app.get("/api/proofs/:file", async (req, res) => { if (!/^[a-f0-9-]+$/i.test(req.params.file)) return res.status(404).end(); const proof = await getProof(req.params.file); if (!proof) return res.status(404).end(); res.type(proof.mime_type).send(Buffer.from(proof.bytes)); });
app.put("/api/timer", (req, res) => {
  const value = z
    .object({
      action: z.enum(["start", "pause", "resume", "reset"]),
      minutes: z.number().min(1).max(180).optional(),
    })
    .parse(req.body);
  transaction((s) => {
    if (value.action === "start")
      s.timer = {
        end: Date.now() + (value.minutes ?? 5) * 60000,
        remaining: 0,
      };
    if (value.action === "pause")
      s.timer = { end: 0, remaining: Math.max(0, s.timer.end - Date.now()) };
    if (value.action === "resume")
      s.timer = { end: Date.now() + s.timer.remaining, remaining: 0 };
    if (value.action === "reset") s.timer = { end: 0, remaining: 0 };
  });
  res.json({ ok: true });
});
app.post("/api/reconcile", (req, res) => {
  const v = z
    .object({ decision: z.enum(["excuse", "apply"]).optional() })
    .parse(req.body);
  transaction((s) => reconcile(s, now(), v.decision));
  res.json({ ok: true });
});
app.get("/api/backup", (_req, res) =>
  res.attachment("level-up-backup.json").json(read()),
);
const previews = new Map<string, { state: State; expires: number }>();
app.post("/api/backup/preview", (req, res) => {
  const s = parseBackup(req.body, now());
  const token = randomUUID();
  previews.clear();
  previews.set(token, { state: s, expires: Date.now() + 600000 });
  res.json({
    token,
    version: s.version,
    logs: s.logs.length,
    quests: s.instances.length,
    ledger: s.ledger.length,
    legacy: req.body.version !== 2,
    warning:
      "This replaces local tracking data. A pre-import backup is saved first. Provider credentials stay on this machine.",
  });
});
app.post("/api/backup/restore", async (req, res) => {
  const token = z.string().parse(req.body.token),
    p = previews.get(token);
  if (!p || p.expires < Date.now())
    throw Error("Preview expired; preview the backup again");
  const path = `pre-import-${Date.now()}`;
  await putRecord("backups", path, read());
      audit(
        p.state,
        now(),
        "restore",
        "Validated replacement; pre-import backup saved",
      );
      save(p.state);
  await flush();
  previews.delete(token);
  res.json({ ok: true, backup: path });
});
app.post("/api/notifications/test", async (_req, res) => {
  transaction((s) => {
    if (s.settings.notifications === "off")
      throw Error("Choose a notification channel first");
    s.jobs.push({
      id: randomUUID(),
      questId: "test",
      at: now(),
      status: "pending",
      channel: s.settings.notifications,
    });
  });
  await deliver();
  res.json({ ok: true });
});
app.post("/api/notifications/claim", (_req, res) => {
  const jobs = transaction((s) => {
    const jobs = s.jobs.filter(
      (j) => j.channel === "browser" && j.status === "pending",
    );
    for (const j of jobs) j.status = "claimed";
    return jobs.map((j) => ({
      ...j,
      title:
        s.instances.find((q) => q.id === j.questId)?.title ??
        "Level Up test notification",
    }));
  });
  res.json(jobs);
});
app.post("/api/notifications/:id/ack", async (req, res) => {
  const v = z
    .object({ success: z.boolean(), error: z.string().max(1000).optional() })
    .parse(req.body);
  transaction((s) => {
    const job = s.jobs.find(
      (j) => j.id === req.params.id && j.status === "claimed",
    );
    if (job) {
      job.status = v.success ? "sent" : "failed";
      job.error = v.error;
    }
  });
  await putRecord("delivery_attempts", randomUUID(), { job: req.params.id, ...v, at: now() });
  res.json({ ok: true });
});
app.get("/api/push/key", (_req, res) =>
  res.json({ key: process.env.VAPID_PUBLIC_KEY ?? null }),
);
app.post("/api/push/subscribe", async (req, res) => {
  const v = z
    .object({
      endpoint: z.string().url().startsWith("https://"),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    })
    .parse(req.body);
  const host = new URL(v.endpoint).hostname;
  if (
    ![
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ].some((h) => host === h || host.endsWith("." + h))
  )
    throw Error("Unsupported push provider");
  await putRecord("push_subscriptions", createHash("sha256").update(v.endpoint).digest("hex"), v);
  res.json({ ok: true });
});
app.get("/api/calendar.ics", (_req, res) =>
  res
    .type("text/calendar")
    .attachment("level-up.ics")
    .send(integrations.ics(read())),
);
app.post("/api/calendar/connect", async (_req, res) =>
  res.json({ url: await integrations.connect() }),
);
app.get("/api/calendar/callback", async (req, res) => {
  await integrations.callback(
    z.string().parse(req.query.code),
    z.string().parse(req.query.state),
  );
  res.redirect(
    (process.env.APP_URL || "http://127.0.0.1:3001") + "/?calendar=connected",
  );
});
app.post("/api/calendar/disconnect", async (_req, res) => {
  await integrations.disconnect();
  res.json({ ok: true });
});
app.post("/api/calendar/sync", async (_req, res) =>
  res.json({ count: await integrations.sync() }),
);
app.post("/api/ai/proposals", async (req, res) =>
  res.json({
    proposals: await integrations.proposals(req.body.consent === true),
  }),
);
app.post("/api/ai/chat", async (req, res) => {
  const message = z.string().trim().min(1).max(1000).parse(req.body.message);
  res.json({ reply: await integrations.chat(message) });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route not found" }),
);
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res
      .status(400)
      .json({
        error:
          err instanceof z.ZodError
            ? err.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : err.message || "Request failed",
      });
  },
);
const port = Number(process.env.PORT || 3001);
app.listen(port, access.host, () =>
  console.log(`Level Up API listening on ${access.host}:${port}`),
);
let schedulerBusy = false;
async function schedulerTick() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try { await createDailyAdventure(); const instant = now(); transaction(s => { reconcile(s, instant); queue(s, instant); }); await deliver(); await flush(); }
  catch (error) { console.error("Scheduler:", (error as Error).message); }
  finally { schedulerBusy = false; }
}
void schedulerTick();
setInterval(() => void schedulerTick(), 15000);
