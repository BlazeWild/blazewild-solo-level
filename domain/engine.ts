import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import {
  type State,
  type Instance,
  type Ledger,
  type Template,
  localDate,
  utc,
  reward,
  totals,
  isoWeek,
} from "./model.js";
export const audit = (s: State, now: string, action: string, detail: string) =>
  s.audit.push({ id: randomUUID(), at: now, action, detail });
function entry(s: State, now: string, key: string, fields: Partial<Ledger>) {
  if (s.ledger.some((e) => e.key === key)) return;
  s.ledger.push({
    id: randomUUID(),
    key,
    at: now,
    date: localDate(now, s.settings.timezone),
    kind: key.split(":")[0],
    lifetime: 0,
    xp: 0,
    hp: 0,
    points: 0,
    ...fields,
  });
}
export function materialize(s: State, now: string) {
  const rotationDay = (day: string) =>
    ((Math.floor(DateTime.fromISO(day).diff(DateTime.fromISO(s.settings.rotationAnchor), "days").days) + s.settings.rotationOffset) % 5 + 5) % 5;
  const isActiveRestDay = (day: string) => rotationDay(day) === 4;
  const today = DateTime.fromISO(now).setZone(s.settings.timezone).startOf("day");
  const last = DateTime.fromISO(s.lastReconcile).setZone(s.settings.timezone).startOf("day");
  const begin = last < today ? last : today;
  for (let d = begin; d <= today.plus({ days: 14 }); d = d.plus({ days: 1 })) {
    const day = d.toISODate()!;
    if (!isActiveRestDay(day)) continue;
    const id = `active-rest-basketball-${day}`;
    if (s.templates.some(t => t.id === id)) continue;
    s.templates.push({
      id,
      title: "Active-rest basketball",
      description: "Play basketball from 7:00 to 8:30 AM. This is active recovery, so there is no separate morning training quest today.",
      category: "Endurance", habit: "training", difficulty: "normal", recurrence: "once",
      timezone: s.settings.timezone, start: "07:00", end: "08:30", startDate: day,
      grace: 15, target: 1, reminderLead: 15, required: true, penalty: 5,
      archived: false, proofRequired: false, createdAt: now,
    } satisfies Template);
  }
  for (const t of s.templates) {
    if (t.archived) continue;
    const today = DateTime.fromISO(now).setZone(t.timezone).startOf("day");
    const last = DateTime.fromISO(s.lastReconcile)
      .setZone(t.timezone)
      .startOf("day");
    const begin = last < today ? last : today;
    for (
      let d = begin;
      d <= today.plus({ days: 14 });
      d = d.plus({ days: 1 })
    ) {
      const day = d.toISODate()!;
      if (day < t.startDate || day < localDate(t.createdAt, t.timezone))
        continue;
      if (t.recurrence === "once" && day !== t.startDate) continue;
      if (
        t.recurrence === "weekdays" &&
        !s.settings.weekdays.includes(d.weekday)
      )
        continue;
      const id = `${t.id}:${day}`;
      if (s.instances.some((i) => i.id === id)) continue;
      let due = utc(day, t.end, t.timezone);
      const opens = utc(day, t.start, t.timezone);
      if (Date.parse(due) < Date.parse(opens))
        due = utc(
          DateTime.fromISO(day).plus({ days: 1 }).toISODate()!,
          t.end,
          t.timezone,
        );
      if (Date.parse(due) < Date.parse(t.createdAt)) continue;
      s.instances.push({
        ...t,
        id,
        templateId: t.id,
        occurrence: day,
        opensAt: opens,
        dueAt: due,
        status: s.settings.restDates.includes(day) ? "excused" : "scheduled",
        generation: 0,
      });
    }
  }
  const wake = s.templates.find(t => t.title === "Wake & reset");
  const training = s.templates.find(t => t.title === "Morning training / planned recovery");
  for (const quest of s.instances) {
    if (!isActiveRestDay(quest.occurrence)) continue;
    if (training && quest.templateId === training.id && quest.status !== "completed") {
      quest.status = "cancelled";
      continue;
    }
    if (wake && quest.templateId === wake.id && quest.status !== "completed") {
      Object.assign(quest, {
        title: "Wake at 6:30 AM", start: "06:30", end: "06:45",
        description: "Wake at 6:30 AM for active-rest-day basketball. Water, brush teeth, and get ready.",
      });
      quest.opensAt = utc(quest.occurrence, "06:30", quest.timezone);
      quest.dueAt = utc(quest.occurrence, "06:45", quest.timezone);
    }
  }
}
function penalty(s: State, q: Instance, now: string) {
  if (
    ["nutrition", "body-weight"].includes(q.habit) ||
    !q.required ||
    s.settings.penaltyMode === "paused" ||
    /\b(food|meal|eat|eating|weight|lunch|breakfast|dinner|nutrition)\b/i.test(
      q.title,
    )
  )
    return;
  const day = localDate(q.dueAt, s.settings.timezone);
  const used = s.ledger.filter(
    (l) => l.kind === "expiry" && l.date === day && !l.reversed,
  );
  const cap = s.settings.penaltyMode === "soft" ? 10 : 20;
  const amount =
    s.settings.penaltyMode === "soft" ? Math.min(2, q.penalty) : q.penalty;
  const t = totals(s);
  entry(s, now, `expiry:${q.id}:${q.generation}`, {
    questId: q.id,
    date: day,
    xp: -Math.min(
      t.xp,
      amount,
      Math.max(0, cap + used.reduce((a, l) => a + l.xp, 0)),
    ),
    hp: -Math.min(
      t.hp,
      amount,
      Math.max(0, cap + used.reduce((a, l) => a + l.hp, 0)),
    ),
    category: q.category,
    points: -Math.min(
      t.scores[q.category],
      Math.max(
        0,
        2 +
          used
            .filter((l) => l.category === q.category)
            .reduce((a, l) => a + l.points, 0),
      ),
      1,
    ),
  });
}
function surprisePenalty(s: State, q: Instance, now: string) {
  if (!q.proofRequired || s.settings.penaltyMode === "paused") return;
  const day = localDate(q.dueAt, s.settings.timezone);
  const earned = s.ledger.filter(l => l.date === day && !l.reversed && l.xp > 0).reduce((sum, l) => sum + l.xp, 0);
  const amount = Math.floor(earned * 0.25);
  if (amount > 0) entry(s, now, `surprise-expiry:${q.id}:${q.generation}`, { questId: q.id, date: day, xp: -Math.min(amount, totals(s).xp) });
}
export const completionDeadline = (q: Instance) =>
  Date.parse(q.dueAt) + q.grace * 60000;
export function reconcile(
  s: State,
  now: string,
  decision?: "excuse" | "apply",
) {
  const gap = DateTime.fromISO(now).diff(
    DateTime.fromISO(s.lastReconcile),
    "days",
  ).days;
  materialize(s, now);
  if (gap > 3 && !decision) {
    s.gapPending = true;
    return;
  }
  if (s.gapPending || gap > 3) {
    audit(
      s,
      now,
      "absence-reconciliation",
      decision === "apply"
        ? "Apply bounded penalties to at most the last 3 days; older quests excused"
        : "Excuse absence",
    );
    s.gapPending = false;
  }
  const day = localDate(now, s.settings.timezone);
  // Replay local dates in order: yesterday's expiry precedes today's recovery.
  const firstDate = localDate(s.lastReconcile, s.settings.timezone);
  for (
    let d = DateTime.fromISO(firstDate);
    d.toISODate()! <= day;
    d = d.plus({ days: 1 })
  ) {
    const recoveryDate = d.toISODate()!;
    entry(s, now, `recovery:${recoveryDate}`, {
      date: recoveryDate,
      hp: Math.min(10, 100 - totals(s).hp),
    });
    for (const q of s.instances) {
      if (q.status !== "scheduled" && q.status !== "available") continue;
      if (s.settings.restDates.includes(q.occurrence)) {
        q.status = "excused";
        continue;
      }
      const deadline = DateTime.fromMillis(completionDeadline(q));
      if (
        Date.parse(now) > deadline.toMillis() &&
        localDate(deadline.toISO()!, s.settings.timezone) <= recoveryDate
      ) {
        if (
          gap > 3 &&
          (decision === "excuse" ||
            DateTime.fromISO(now).diff(DateTime.fromISO(q.dueAt), "days").days >
              3)
        ) {
          q.status = "excused";
          continue;
        }
        q.status = "missed";
        if (q.proofRequired) surprisePenalty(s, q, now);
        else penalty(s, q, now);
      } else if (Date.parse(now) >= Date.parse(q.opensAt))
        q.status = "available";
    }
  }
  // Only closed ISO weeks qualify; three distinct eligible days are required.
  const weeks = new Set(s.instances.map((q) => isoWeek(q.occurrence)));
  for (const week of weeks) {
    if (week >= isoWeek(day)) continue;
    const qs = s.instances.filter(
      (q) =>
        isoWeek(q.occurrence) === week &&
        q.required &&
        !["excused", "cancelled"].includes(q.status),
    );
    if (
      qs.length &&
      new Set(qs.map((q) => q.occurrence)).size >= 3 &&
      qs.filter((q) => q.status === "completed").length / qs.length >= 0.8
    )
      entry(s, now, `weekly:${week}`, { lifetime: 50, xp: 50 });
  }
  s.lastReconcile = now;
}
export function act(
  s: State,
  id: string,
  action: string,
  now: string,
  input: {
    completedAt?: string;
    note?: string;
    opensAt?: string;
    dueAt?: string;
    minutes?: number;
    value?: number;
  } = {},
) {
  const q = s.instances.find((q) => q.id === id);
  if (!q) throw Error("Quest not found");
  if (action === "complete" || action === "correct") {
    if (q.status === "completed") return;
    if (["cancelled", "excused"].includes(q.status))
      throw Error("This quest is not eligible");
    if (s.gapPending) throw Error("Review absence reconciliation first");
    const claimed = action === "correct" ? input.completedAt : now;
    if (
      !claimed ||
      !Number.isFinite(Date.parse(claimed)) ||
      Date.parse(claimed) > Date.parse(now)
    )
      throw Error("Choose an actual completion time in the past");
    if (
      Date.parse(claimed) < Date.parse(q.opensAt) ||
      Date.parse(claimed) > completionDeadline(q)
    )
      throw Error("Completion must be inside the quest window including grace");
    if (q.proofRequired && !q.proofUrl)
      throw Error("Upload photo proof before completing this quest");
    if (q.habit === "walking" && q.target > 1) {
      if (!Number.isInteger(input.value) || input.value! < q.target)
        throw Error(`Enter at least ${q.target.toLocaleString()} steps to complete this quest`);
      q.completedValue = input.value;
    }
    if (action === "correct" && !input.note?.trim())
      throw Error("A correction needs a note");
    if (action === "complete" && q.status === "missed")
      throw Error("Use the visible correction flow for missed quests");
    for (const l of s.ledger.filter(
      (l) => l.questId === id && l.kind === "expiry" && !l.reversed,
    )) {
      l.reversed = true;
      entry(s, now, `correction:${l.id}`, { questId: id });
    }
    q.status = "completed";
    q.completedAt = claimed;
    const alreadyEarned = s.ledger.some(
      (l) => l.questId === id && l.kind === "completion",
    );
    entry(s, now, `completion:${id}:${q.generation}`, {
      questId: id,
      lifetime: alreadyEarned ? 0 : (q.rewardXp ?? reward[q.difficulty]),
      xp: q.rewardXp ?? reward[q.difficulty],
      hp: Math.min(2, 100 - totals(s).hp),
      category: q.category,
      points: reward[q.difficulty] / 10,
    });
  } else if (action === "undo") {
    throw Error("Completed quests are permanent and cannot be unchecked");
  } else if (action === "excuse" || action === "cancel") {
    for (const l of s.ledger.filter((l) => l.questId === id && !l.reversed))
      l.reversed = true;
    q.status = action === "excuse" ? "excused" : "cancelled";
  } else if (action === "snooze") {
    q.snoozeUntil = DateTime.fromISO(now)
      .plus({ minutes: input.minutes ?? 10 })
      .toUTC()
      .toISO()!;
  } else if (action === "reschedule") {
    if (["completed", "missed", "excused", "cancelled"].includes(q.status))
      throw Error("Only open quests can be rescheduled");
    if (
      !input.opensAt ||
      !input.dueAt ||
      !Number.isFinite(Date.parse(input.opensAt)) ||
      !Number.isFinite(Date.parse(input.dueAt)) ||
      Date.parse(input.dueAt) < Date.parse(input.opensAt) ||
      Date.parse(input.dueAt) < Date.parse(now)
    )
      throw Error("Choose a valid future window");
    q.opensAt = new Date(input.opensAt).toISOString();
    q.dueAt = new Date(input.dueAt).toISOString();
    q.status = "scheduled";
    q.generation++;
  } else throw Error("Unknown action");
  s.events.push({
    id: randomUUID(),
    questId: id,
    at: now,
    claimedAt: input.completedAt,
    note: input.note ?? "",
    action,
  });
  audit(s, now, action, `${q.title}${input.note ? ": " + input.note : ""}`);
}
export function progress(s: State, days: number, now: string) {
  const end = DateTime.fromISO(now).setZone(s.settings.timezone).startOf("day");
  return Array.from({ length: days }, (_, i) => {
    const date = end.minus({ days: days - 1 - i }).toISODate()!;
    const log = s.logs.find((l) => l.date === date);
    const start = DateTime.fromISO(date).minus({ days: 6 }).toISODate()!;
    const weights = s.logs.filter(
      (l) => l.date >= start && l.date <= date && l.weight !== null,
    );
    const qs = s.instances.filter(
      (q) =>
        q.occurrence === date &&
        q.required &&
        !["cancelled", "excused"].includes(q.status),
    );
    const l = s.ledger.filter((l) => l.date === date && !l.reversed);
    const tracked = date >= localDate(s.createdAt, s.settings.timezone);
    const balance = tracked
      ? totals({
          ...s,
          ledger: s.ledger.filter((l) => l.date <= date),
        })
      : null;
    return {
      date,
      xpBalance: balance?.xp ?? null,
      hpBalance: balance?.hp ?? null,
      weight: log?.weight ?? null,
      waist: log?.waist ?? null,
      steps: log?.steps ?? null,
      sleep: log?.sleep ?? null,
      desk: log?.desk ?? null,
      pullups: log?.pullups ?? null,
      handstand: log?.handstand ?? null,
      average: weights.length
        ? weights.reduce((a, l) => a + l.weight!, 0) / weights.length
        : null,
      samples: weights.length,
      target: s.settings.stepGoal,
      completion: qs.length
        ? Math.round(
            (qs.filter((q) => q.status === "completed").length / qs.length) *
              100,
          )
        : null,
      xp: l.length ? l.reduce((a, l) => a + l.xp, 0) : null,
      hp: l.length ? l.reduce((a, l) => a + l.hp, 0) : null,
    };
  });
}
