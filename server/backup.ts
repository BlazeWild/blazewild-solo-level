import { z } from "zod";
import { DateTime } from "luxon";
import {
  settingsSchema,
  categories,
  templateSchema,
  logSchema,
  type State,
  fresh,
  date,
} from "../domain/model.js";
const iso = z.string().datetime({ offset: true });
const instance = templateSchema.extend({
  id: z.string(),
  createdAt: iso,
  templateId: z.string(),
  occurrence: date,
  opensAt: iso,
  dueAt: iso,
  status: z.enum([
    "scheduled",
    "available",
    "completed",
    "missed",
    "excused",
    "cancelled",
  ]),
  completedAt: iso.optional(),
  generation: z.number().int().min(0),
  snoozeUntil: iso.optional(),
});
const backup = z.object({
  version: z.literal(2),
  createdAt: iso,
  lastReconcile: iso,
  settings: settingsSchema,
  templates: z
    .array(templateSchema.extend({ id: z.string(), createdAt: iso }))
    .max(2000),
  instances: z.array(instance).max(100000),
  ledger: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      at: iso,
      date,
      questId: z.string().optional(),
      kind: z.string(),
      lifetime: z.number().min(0).max(50),
      xp: z.number().min(-20).max(50),
      hp: z.number().min(-20).max(10),
      category: z.enum(categories).optional(),
      points: z.number().min(-2).max(3),
      reversed: z.boolean().optional(),
    }),
  ),
  logs: z.array(logSchema),
  audit: z.array(
    z.object({
      id: z.string(),
      at: iso,
      action: z.string(),
      detail: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      questId: z.string(),
      at: iso,
      claimedAt: iso.optional(),
      note: z.string(),
      action: z.string(),
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.string(),
      questId: z.string(),
      at: iso,
      status: z.string(),
      error: z.string().optional(),
      channel: z.string(),
    }),
  ),
  timer: z.object({ end: z.number().min(0), remaining: z.number().min(0) }),
  gapPending: z.boolean(),
});
export function parseBackup(v: unknown, now: string): State {
  if ((v as any)?.version === 2) {
    const s = backup.parse(v);
    for (const items of [
      s.templates,
      s.instances,
      s.ledger,
      s.events,
      s.audit,
      s.jobs,
    ])
      if (new Set(items.map((i) => i.id)).size !== items.length)
        throw Error("Duplicate record IDs");
    if (
      new Set(s.instances.map((i) => i.templateId + ":" + i.occurrence))
        .size !== s.instances.length
    )
      throw Error("Duplicate occurrences");
    if (
      new Set(s.ledger.map((l) => l.key)).size !== s.ledger.length ||
      new Set(s.logs.map((l) => l.date)).size !== s.logs.length
    )
      throw Error("Duplicate ledger keys or dates");
    for (const i of s.instances)
      if (
        !s.templates.some((t) => t.id === i.templateId) ||
        Date.parse(i.dueAt) < Date.parse(i.opensAt)
      )
        throw Error("Invalid instance reference or window");
    return s;
  }
  const legacy = z
    .object({
      settings: z.object({
        start: date,
        lunch: z.string().regex(/^\d\d:\d\d$/),
        stepGoal: z.number().min(1000).max(30000),
      }),
      days: z.record(
        date,
        z.object({
          done: z.record(z.string(), z.boolean()),
          weight: z.number().optional(),
          steps: z.number().optional(),
          desk: z.number().optional(),
          sleep: z.number().optional(),
        }),
      ),
      skills: z.object({
        pullups: z.number().optional(),
        handstand: z.number().optional(),
        waist: z.number().optional(),
      }),
    })
    .parse(v);
  const s = fresh(now);
  s.settings.rotationAnchor = legacy.settings.start;
  s.settings.lunch = legacy.settings.lunch;
  s.settings.stepGoal = legacy.settings.stepGoal;
  settingsSchema.parse(s.settings);
  for (const [day, l] of Object.entries(legacy.days))
    s.logs.push(
      logSchema.parse({
        date: day,
        weight: l.weight ?? null,
        steps: l.steps ?? null,
        desk: l.desk === undefined ? null : l.desk * 60,
        sleep: l.sleep ?? null,
        waist: null,
        pullups: null,
        handstand: null,
        provenance: "Imported prototype self-report",
      }),
    );
  const today = DateTime.fromISO(now).setZone(s.settings.timezone).toISODate()!;
  let log = s.logs.find((l) => l.date === today);
  if (!log) {
    log = logSchema.parse({
      date: today,
      weight: null,
      steps: null,
      desk: null,
      sleep: null,
      waist: null,
      pullups: null,
      handstand: null,
    });
    s.logs.push(log);
  }
  Object.assign(log, legacy.skills);
  logSchema.parse(log);
  s.audit.push({
    id: "legacy-import",
    at: now,
    action: "legacy-import",
    detail:
      "Imported manual measurements. Prototype checkmarks retained in this audit; not converted to timed completions or verified XP. " +
      JSON.stringify(
        Object.fromEntries(
          Object.entries(legacy.days).map(([k, v]) => [k, v.done]),
        ),
      ),
  });
  return s;
}
