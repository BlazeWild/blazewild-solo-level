import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  totals,
  utc,
  localDate,
  templateSchema,
  type State,
} from "../domain/model.js";
import { act, reconcile, materialize, progress } from "../domain/engine.js";
import { parseBackup } from "../server/backup.js";
function fixture(now = "2026-12-31T03:00:00.000Z") {
  const s = fresh(now);
  s.templates.push({
    ...templateSchema.parse({
      title: "Study",
      category: "Focus",
      difficulty: "normal",
      recurrence: "daily",
      timezone: "Asia/Kathmandu",
      start: "10:00",
      end: "10:30",
      startDate: "2026-12-31",
      grace: 15,
      required: true,
      penalty: 5,
    }),
    id: "q",
    createdAt: now,
  });
  materialize(s, now);
  return s;
}
const id = "q:2026-12-31";
test("Kathmandu, year rollover, noon and midnight use IANA time", () => {
  assert.equal(
    utc("2026-12-31", "10:00", "Asia/Kathmandu"),
    "2026-12-31T04:15:00.000Z",
  );
  assert.equal(
    localDate("2026-12-31T18:15:00Z", "Asia/Kathmandu"),
    "2027-01-01",
  );
  assert.equal(
    utc("2026-12-31", "00:00", "Asia/Kathmandu"),
    "2026-12-30T18:15:00.000Z",
  );
  assert.equal(
    utc("2026-12-31", "12:00", "Asia/Kathmandu"),
    "2026-12-31T06:15:00.000Z",
  );
});
test("DST retains local clock across offset changes", () => {
  assert.equal(
    utc("2026-03-07", "10:00", "America/New_York"),
    "2026-03-07T15:00:00.000Z",
  );
  assert.equal(
    utc("2026-03-08", "10:00", "America/New_York"),
    "2026-03-08T14:00:00.000Z",
  );
  assert.equal(
    utc("2026-11-01", "10:00", "America/New_York"),
    "2026-11-01T15:00:00.000Z",
  );
});
test("inclusive grace boundary wins, retries never double-award", () => {
  const s = fixture();
  reconcile(s, "2026-12-31T05:00:00.000Z");
  assert.equal(s.instances[0].status, "available");
  act(s, id, "complete", "2026-12-31T05:00:00.000Z");
  act(s, id, "complete", "2026-12-31T05:00:00.000Z");
  reconcile(s, "2026-12-31T05:01:00.000Z");
  assert.equal(totals(s).lifetime, 20);
  assert.equal(totals(s).xp, 20);
  assert.equal(s.ledger.filter((l) => l.kind === "completion").length, 1);
});
test("step-target walking quest cannot complete below its recorded target", () => {
  const s = fixture();
  Object.assign(s.instances[0], { habit: "walking", target: 2500 });
  assert.throws(() => act(s, id, "complete", "2026-12-31T04:30:00.000Z", { value: 2499 }), /2,500 steps/);
  act(s, id, "complete", "2026-12-31T04:30:00.000Z", { value: 2500 });
  assert.equal(s.instances[0].status, "completed");
  assert.equal(s.instances[0].completedValue, 2500);
});
test("strict grace zero and opening boundary", () => {
  const s = fixture();
  s.instances[0].grace = 0;
  assert.throws(() => act(s, id, "complete", "2026-12-31T04:14:59.999Z"));
  act(s, id, "complete", "2026-12-31T04:15:00.000Z");
  assert.equal(s.instances[0].status, "completed");
  const b = fixture();
  b.instances[0].grace = 0;
  reconcile(b, "2026-12-31T04:45:00.001Z");
  assert.equal(b.instances[0].status, "missed");
});
test("expiry after boundary, correction reverses exactly once with audit", () => {
  const s = fixture();
  reconcile(s, "2026-12-31T05:00:00.001Z");
  reconcile(s, "2026-12-31T05:00:01.000Z");
  assert.equal(totals(s).hp, 95);
  assert.equal(s.ledger.filter((l) => l.kind === "expiry").length, 1);
  assert.throws(() =>
    act(s, id, "correct", "2026-12-31T05:02:00Z", {
      completedAt: "2026-12-31T04:40:00Z",
    }),
  );
  act(s, id, "correct", "2026-12-31T05:02:00Z", {
    completedAt: "2026-12-31T04:40:00Z",
    note: "Completed before deadline; offline",
  });
  act(s, id, "correct", "2026-12-31T05:02:00Z", {
    completedAt: "2026-12-31T04:40:00Z",
    note: "retry",
  });
  assert.equal(totals(s).hp, 100);
  assert.equal(totals(s).lifetime, 20);
  assert.equal(s.ledger.filter((l) => l.kind === "correction").length, 1);
  assert.ok(s.audit.some((a) => a.action === "correct"));
});
test("completed quests are permanent and cannot be unchecked", () => {
  const s = fixture();
  act(s, id, "complete", "2026-12-31T04:30:00Z");
  assert.throws(
    () => act(s, id, "undo", "2026-12-31T04:31:00Z"),
    /permanent/,
  );
  assert.equal(s.instances[0].status, "completed");
  assert.equal(totals(s).xp, 20);
  assert.equal(totals(s).lifetime, 20);
  assert.equal(totals(s).scores.Focus, 2);
});
test("grace is measured from the due time, not capped one hour after opening", () => {
  const s = fixture();
  s.instances[0].grace = 120;
  act(s, id, "complete", "2026-12-31T06:45:00.000Z");
  assert.equal(s.instances[0].status, "completed");
});
test("daily caps, optional no penalty and recovery once", () => {
  const s = fixture();
  for (let i = 1; i < 12; i++)
    s.instances.push({
      ...s.instances[0],
      id: "extra" + i,
      templateId: "extra" + i,
    });
  s.instances[11].required = false;
  reconcile(s, "2026-12-31T05:01:00Z");
  assert.equal(totals(s).hp, 80);
  assert.equal(totals(s).xp, 0);
  reconcile(s, "2026-12-31T18:16:00Z");
  reconcile(s, "2026-12-31T18:16:01Z");
  assert.equal(totals(s).hp, 90);
});
test("long gap needs preview; excuse avoids penalties; materialization unique", () => {
  const s = fixture();
  reconcile(s, "2027-01-10T10:00:00Z");
  assert.equal(s.gapPending, true);
  assert.equal(totals(s).hp, 100);
  const count = s.instances.length;
  materialize(s, "2027-01-10T10:00:00Z");
  assert.equal(s.instances.length, count);
  reconcile(s, "2027-01-10T10:00:00Z", "excuse");
  assert.equal(s.gapPending, false);
  assert.equal(s.instances[0].status, "excused");
  assert.equal(totals(s).hp, 100);
});
test("no occurrence before plan creation; month rollover", () => {
  const s = fixture();
  assert.ok(s.instances.every((q) => q.occurrence >= "2026-12-31"));
  assert.ok(s.instances.some((q) => q.occurrence === "2027-01-01"));
});
test("7-calendar-day average is sparse with sample count and nulls", () => {
  const s = fixture();
  s.logs = [
    { date: "2026-12-25", weight: 80 },
    { date: "2026-12-30", weight: 78 },
    { date: "2026-12-31", weight: 77 },
  ] as any;
  const rows = progress(s, 7, "2026-12-31T10:00:00Z");
  assert.equal(rows.at(-1)!.samples, 3);
  assert.equal(rows.at(-1)!.average, 235 / 3);
  assert.equal(rows[1].weight, null);
  assert.equal(rows[1].steps, null);
});
test("backup roundtrip retains idempotency and rejects duplicate keys", () => {
  const s = fixture();
  act(s, id, "complete", "2026-12-31T04:30:00.000Z");
  const b = parseBackup(JSON.parse(JSON.stringify(s)), "2026-12-31T04:30:00Z");
  act(b, id, "complete", "2026-12-31T04:31:00Z");
  assert.equal(totals(b).lifetime, 20);
  s.ledger.push({ ...s.ledger[0], id: "duplicate" });
  assert.throws(() => parseBackup(s, "2026-12-31T04:31:00Z"));
});
test("legacy import preserves measurements, converts desk hours, never invents XP", () => {
  const s = parseBackup(
    {
      settings: { start: "2026-01-01", lunch: "13:00", stepGoal: 5000 },
      days: { "2026-12-30": { done: { train: true }, weight: 78, desk: 3 } },
      skills: { pullups: 5 },
    },
    "2026-12-31T03:00:00Z",
  );
  assert.equal(s.logs[0].desk, 180);
  assert.equal(totals(s).lifetime, 0);
  assert.ok(s.audit[0].detail.includes("train"));
  assert.throws(() =>
    parseBackup({ settings: {}, days: {}, skills: {} }, "2026-12-31T03:00:00Z"),
  );
});
test("weekly reward requires closed week, at least three days, and is idempotent", () => {
  const s = fixture("2026-12-28T00:00:00Z");
  s.templates = [];
  s.instances = [0, 1, 2].map((n) => ({
    ...fixture().instances[0],
    id: "week" + n,
    occurrence: `2026-12-${28 + n}`,
    status: "completed" as const,
  }));
  reconcile(s, "2026-12-30T10:00:00Z");
  assert.equal(totals(s).lifetime, 0);
  reconcile(s, "2027-01-04T10:00:00Z", "excuse");
  reconcile(s, "2027-01-04T10:01:00Z");
  assert.equal(totals(s).lifetime, 50);
});
test("DST ambiguous local time chooses earlier instant, gap moves forward", () => {
  assert.equal(
    utc("2026-11-01", "01:30", "America/New_York"),
    "2026-11-01T05:30:00.000Z",
  );
  assert.equal(
    utc("2026-03-08", "02:30", "America/New_York"),
    "2026-03-08T07:30:00.000Z",
  );
});
test("food/body-weight quests never penalize even under another category", () => {
  const s = fixture();
  s.instances[0].title = "Log food";
  reconcile(s, "2026-12-31T05:01:00Z");
  assert.equal(totals(s).hp, 100);
  assert.equal(s.ledger.filter((l) => l.kind === "expiry").length, 0);
});
test("snooze never extends a deadline; pause and rest avoid penalties", () => {
  const s = fixture();
  const due = s.instances[0].dueAt;
  act(s, id, "snooze", "2026-12-31T04:59:00Z", { minutes: 60 });
  assert.equal(s.instances[0].dueAt, due);
  reconcile(s, "2026-12-31T05:01:00Z");
  assert.equal(s.instances[0].status, "missed");
  const b = fixture();
  b.settings.penaltyMode = "paused";
  reconcile(b, "2026-12-31T05:01:00Z");
  assert.equal(totals(b).hp, 100);
  const c = fixture();
  c.settings.restDates = ["2026-12-31"];
  reconcile(c, "2026-12-31T05:01:00Z");
  assert.equal(c.instances[0].status, "excused");
});
test("overnight recurrence respects local DST wall clock", () => {
  const s = fixture("2026-03-07T12:00:00.000Z");
  s.instances = [];
  s.settings.timezone = "America/New_York";
  Object.assign(s.templates[0], {
    startDate: "2026-03-07",
    timezone: "America/New_York",
    start: "23:00",
    end: "04:00",
  });
  materialize(s, "2026-03-07T12:00:00.000Z");
  assert.equal(s.instances[0].opensAt, "2026-03-08T04:00:00.000Z");
  assert.equal(s.instances[0].dueAt, "2026-03-08T08:00:00.000Z");
});
test("resume after midnight applies prior-day expiry before daily recovery", () => {
  const s = fixture();
  reconcile(s, "2027-01-01T00:00:00.000Z");
  assert.equal(s.instances[0].status, "missed");
  assert.equal(totals(s).hp, 100);
  const n = s.ledger.length;
  reconcile(s, "2027-01-01T00:01:00.000Z");
  assert.equal(s.ledger.length, n);
});
test("bounded custom reward is honored without changing difficulty habit points", () => {
  const s = fixture();
  s.instances[0].rewardXp = 12;
  act(s, id, "complete", "2026-12-31T04:30:00.000Z");
  assert.equal(totals(s).lifetime, 12);
  assert.equal(totals(s).scores.Focus, 2);
  assert.throws(() =>
    templateSchema.parse({ ...s.templates[0], rewardXp: 100 }),
  );
});
test("recurrence uses the template timezone even when the profile is a different date", () => {
  const s = fresh("2027-01-01T01:00:00.000Z");
  s.templates.push({
    ...templateSchema.parse({
      title: "Pacific evening",
      category: "Focus",
      difficulty: "easy",
      recurrence: "daily",
      timezone: "America/Los_Angeles",
      start: "18:00",
      end: "19:00",
      startDate: "2026-12-31",
      grace: 15,
      required: true,
      penalty: 5,
    }),
    id: "pacific",
    createdAt: s.createdAt,
  });
  materialize(s, s.createdAt);
  assert.ok(
    s.instances.some(
      (q) =>
        q.occurrence === "2026-12-31" &&
        q.opensAt === "2027-01-01T02:00:00.000Z",
    ),
  );
});
test("missed surprise deducts 25 percent of today's positive XP and never creates debt", () => {
  const s = fresh("2026-12-31T00:00:00.000Z");
  s.ledger.push({ id: "earned", key: "earned", at: "2026-12-31T01:00:00.000Z", date: "2026-12-31", kind: "completion", lifetime: 100, xp: 100, hp: 0, points: 0 });
  s.templates.push({ ...templateSchema.parse({ title: "Surprise quest: Test", category: "Consistency", habit: "walking", difficulty: "easy", recurrence: "once", timezone: "Asia/Kathmandu", start: "06:00", end: "22:30", startDate: "2026-12-31", grace: 0, required: false, penalty: 0, proofRequired: true }), id: "surprise", createdAt: s.createdAt });
  materialize(s, s.createdAt);
  reconcile(s, "2026-12-31T17:00:01.000Z");
  assert.equal(totals(s).xp, 75);
  reconcile(s, "2026-12-31T17:01:00.000Z");
  assert.equal(totals(s).xp, 75);
  const zero = fresh("2026-12-31T00:00:00.000Z");
  zero.templates.push({ ...s.templates[0], id: "zero", createdAt: zero.createdAt }); materialize(zero, zero.createdAt); reconcile(zero, "2026-12-31T17:00:01.000Z");
  assert.equal(totals(zero).xp, 0);
});
