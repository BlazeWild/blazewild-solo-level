import { z } from "zod";
import { DateTime } from "luxon";
export const categories = [
  "Strength",
  "Mobility",
  "Endurance",
  "Focus",
  "Recovery",
  "Consistency",
] as const;
export const zone = z
  .string()
  .refine((v) => DateTime.now().setZone(v).isValid, "Use an IANA timezone");
export const date = z
  .string()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid,
    "Invalid date",
  );
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const templateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  category: z.enum(categories),
  habit: z
    .enum([
      "general",
      "training",
      "walking",
      "skills",
      "nutrition",
      "body-weight",
      "hygiene",
      "hair-care",
      "meditation",
      "sleep",
    ])
    .default("general"),
  difficulty: z.enum(["easy", "normal", "hard"]),
  rewardXp: z.number().int().min(0).max(30).optional(),
  recurrence: z.enum(["daily", "weekdays", "once"]),
  timezone: zone,
  start: time,
  end: time,
  startDate: date,
  grace: z.number().int().min(0).max(120),
  target: z.number().min(1).max(100000).default(1),
  reminderLead: z.number().int().min(0).max(120).default(5),
  required: z.boolean(),
  penalty: z.number().int().min(0).max(5),
  archived: z.boolean().default(false),
  proofRequired: z.boolean().default(false),
});
export type Template = z.infer<typeof templateSchema> & {
  id: string;
  createdAt: string;
};
export const settingsSchema = z.object({
  name: z.string().min(1).max(80),
  timezone: zone,
  age: z.number().min(18).max(120),
  height: z.number().min(80).max(250),
  startingWeight: z.number().min(30).max(300),
  goalWeight: z.number().min(30).max(300),
  rotationAnchor: date,
  rotationOffset: z.number().int().min(0).max(4),
  deskWeek: z.number().int().min(0).max(9),
  stepGoal: z.number().int().min(0).max(100000),
  wake: time,
  workStart: time,
  workEnd: time,
  lunch: time,
  weekdays: z.array(z.number().int().min(1).max(7)),
  penaltyMode: z.enum(["standard", "soft", "paused"]),
  grace: z.number().int().min(0).max(120),
  restDates: z.array(date).max(366),
  quietStart: time,
  quietEnd: time,
  focusUntil: z
    .string()
    .refine(
      (v) => v === "" || Number.isFinite(Date.parse(v)),
      "Use an ISO instant or leave blank",
    ),
  notifications: z.enum(["off", "browser", "desktop", "push"]),
  rankTitles: z.array(z.string().min(1).max(40)).length(6),
  aiEnabled: z.boolean(),
  calendarCategories: z.array(z.enum(categories)),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Instance = Template & {
  templateId: string;
  occurrence: string;
  opensAt: string;
  dueAt: string;
  status:
    | "scheduled"
    | "available"
    | "completed"
    | "missed"
    | "excused"
    | "cancelled";
  completedAt?: string;
  proofUrl?: string;
  completedValue?: number;
  /** A missed quest was later recorded as done within its original window. */
  lateCorrection?: boolean;
  generation: number;
  snoozeUntil?: string;
};
export type Ledger = {
  id: string;
  key: string;
  at: string;
  date: string;
  questId?: string;
  kind: string;
  lifetime: number;
  xp: number;
  hp: number;
  category?: string;
  points: number;
  reversed?: boolean;
};
export const logSchema = z.object({
  date,
  weight: z.number().min(30).max(300).nullable(),
  waist: z.number().min(15).max(100).nullable(),
  steps: z.number().int().min(0).max(100000).nullable(),
  sleep: z.number().min(0).max(24).nullable(),
  sleptAt: time.nullable().default(null),
  wokeAt: time.nullable().default(null),
  desk: z.number().min(0).max(1440).nullable(),
  pullups: z.number().int().min(0).max(200).nullable(),
  handstand: z.number().min(0).max(3600).nullable(),
  fatigue: z.enum(["fresh", "normal", "tired"]).default("normal"),
  food: z.string().max(3000).default(""),
  provenance: z.string().max(500).default("Manual self-report"),
});
export type DailyLog = z.infer<typeof logSchema>;
export type State = {
  version: 2;
  createdAt: string;
  lastReconcile: string;
  settings: Settings;
  templates: Template[];
  instances: Instance[];
  ledger: Ledger[];
  logs: DailyLog[];
  audit: { id: string; at: string; action: string; detail: string }[];
  events: {
    id: string;
    questId: string;
    at: string;
    claimedAt?: string;
    note: string;
    action: string;
  }[];
  jobs: {
    id: string;
    questId: string;
    at: string;
    status: string;
    error?: string;
    channel: string;
    kind?: "lead" | "start" | "due" | "snooze" | "test";
  }[];
  timer: { end: number; remaining: number };
  gapPending: boolean;
};
export const reward = { easy: 10, normal: 20, hard: 30 };
export const localDate = (now: string, timezone: string) =>
  DateTime.fromISO(now).setZone(timezone).toISODate()!;
export function utc(date: string, time: string, timezone: string) {
  const d = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!d.isValid) throw Error("Invalid local time");
  const choices = d
    .getPossibleOffsets()
    .sort((a, b) => a.toMillis() - b.toMillis());
  return choices[0].toUTC().toISO()!;
}
export const isoWeek = (date: string) => {
  const d = DateTime.fromISO(date);
  return `${d.weekYear}-W${String(d.weekNumber).padStart(2, "0")}`;
};
export function totals(s: State) {
  let xp = 0,
    hp = 100,
    lifetime = 0;
  const scores: Record<string, number> = Object.fromEntries(
    categories.map((c) => [c, 0]),
  );
  for (const l of s.ledger) {
    lifetime += l.lifetime;
    if (l.reversed) continue;
    xp = Math.max(0, xp + l.xp);
    hp = Math.min(100, Math.max(0, hp + l.hp));
    if (l.category)
      scores[l.category] = Math.max(0, scores[l.category] + l.points);
  }
  return { xp, hp, lifetime, level: 1 + Math.floor(lifetime / 200), scores };
}
export function fresh(now: string): State {
  const day = localDate(now, "Asia/Kathmandu");
  return {
    version: 2,
    createdAt: now,
    lastReconcile: now,
    settings: {
      name: "Asok",
      timezone: "Asia/Kathmandu",
      age: 23,
      height: 174,
      startingWeight: 78.5,
      goalWeight: 70,
      rotationAnchor: day,
      rotationOffset: 0,
      deskWeek: 0,
      stepGoal: 5000,
      wake: "07:55",
      workStart: "10:00",
      workEnd: "18:30",
      lunch: "15:00",
      weekdays: [1, 2, 3, 4, 5],
      penaltyMode: "standard",
      grace: 15,
      restDates: [],
      quietStart: "23:00",
      quietEnd: "07:45",
      focusUntil: "",
      notifications: "off",
      rankTitles: [
        "Awakening",
        "Apprentice",
        "Hunter",
        "Elite",
        "Vanguard",
        "Monarch",
      ],
      aiEnabled: false,
      calendarCategories: ["Strength", "Focus"],
    },
    templates: [],
    instances: [],
    ledger: [],
    logs: [],
    audit: [],
    events: [],
    jobs: [],
    timer: { end: 0, remaining: 0 },
    gapPending: false,
  };
}
