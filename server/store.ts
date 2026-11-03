import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import {
  fresh,
  templateSchema,
  type State,
  type Template,
  localDate,
  utc,
} from "../domain/model.js";
import { materialize } from "../domain/engine.js";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required; Neon is the authoritative database");
export const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS app_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS app_records (namespace text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(namespace,id))`;
await sql`CREATE TABLE IF NOT EXISTS quest_proofs (id text PRIMARY KEY, quest_id text NOT NULL, mime_type text NOT NULL, bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
let state: State | null = null;
let persistChain: Promise<unknown> = Promise.resolve();
export function save(s: State) {
  state = structuredClone(s);
  const payload = JSON.stringify(state);
  persistChain = persistChain.then(() => sql`INSERT INTO app_state(id,data,updated_at) VALUES ('owner', ${payload}::jsonb, now()) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=now()`);
}
export function read(): State {
  if (!state) throw Error("Neon state has not initialized");
  return structuredClone(state);
}
export function transaction<T>(fn: (s: State) => T): T {
  const s = read(), result = fn(s); save(s); return result;
}
export const flush = () => persistChain;
export async function putRecord(namespace: string, id: string, data: unknown) { await sql`INSERT INTO app_records(namespace,id,data,updated_at) VALUES (${namespace},${id},${JSON.stringify(data)}::jsonb,now()) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data,updated_at=now()`; }
export async function getRecord<T>(namespace: string, id: string): Promise<T | undefined> { const rows = await sql`SELECT data FROM app_records WHERE namespace=${namespace} AND id=${id}`; return rows[0]?.data as T | undefined; }
export async function listRecords<T>(namespace: string): Promise<T[]> { const rows = await sql`SELECT data FROM app_records WHERE namespace=${namespace} ORDER BY updated_at`; return rows.map(r => r.data as T); }
export async function deleteRecords(namespace: string, ids: string[]) { if (!ids.length) return; await sql`DELETE FROM app_records WHERE namespace=${namespace} AND id = ANY(${ids})`; }
export async function putProof(id: string, questId: string, mime: string, bytes: Buffer) {
  // Neon HTTP parameters do not accept Node Buffers directly. Send text and
  // let Postgres convert it to bytea so photo uploads work consistently.
  const base64 = bytes.toString("base64");
  await sql`INSERT INTO quest_proofs(id,quest_id,mime_type,bytes) VALUES (${id},${questId},${mime},decode(${base64}, 'base64'))`;
}
export async function getProof(id: string) { const rows = await sql`SELECT mime_type,bytes FROM quest_proofs WHERE id=${id}`; return rows[0] as { mime_type: string; bytes: Buffer } | undefined; }
const stored = await sql`SELECT data FROM app_state WHERE id='owner'`;
if (stored[0]) state = stored[0].data as State;
if (state && !state.audit.some(a => a.action === "break-schedule-v3")) {
  const instant = new Date().toISOString(), today = localDate(instant, state.settings.timezone);
  state.settings.lunch = "15:00";
  const schedule = new Map([["Balanced lunch", ["15:00", "15:10", "Take ten calm minutes for a balanced lunch during your 3–4 PM break."]], ["Lunchtime walk", ["15:10", "16:00", "Use the remaining break for a relaxed walk."]]]);
  for (const template of state.templates) {
    const update = schedule.get(template.title); if (!update) continue;
    [template.start, template.end, template.description] = update;
    for (const quest of state.instances.filter(q => q.templateId === template.id && q.occurrence >= today && q.status !== "completed")) {
      quest.start = update[0]; quest.end = update[1]; quest.description = update[2];
      quest.opensAt = utc(quest.occurrence, update[0], quest.timezone); quest.dueAt = utc(quest.occurrence, update[1], quest.timezone);
      quest.status = Date.parse(instant) >= Date.parse(quest.opensAt) ? "available" : "scheduled";
      for (const entry of state.ledger.filter(l => l.questId === quest.id && l.kind === "expiry" && !l.reversed)) entry.reversed = true;
    }
  }
  state.audit.push({ id: randomUUID(), at: instant, action: "break-schedule-v3", detail: "Break migrated to 3:00–4:00 PM Nepal time: lunch 3:00–3:10 and walk 3:10–4:00." });
  save(state); await flush();
}
if (state && !state.audit.some(a => a.action === "lunch-walk-v4")) {
  const instant = new Date().toISOString(), today = localDate(instant, state.settings.timezone);
  const lunch = state.templates.find(t => t.title === "Balanced lunch");
  const walk = state.templates.find(t => t.title === "Lunchtime walk");
  if (lunch) {
    Object.assign(lunch, {
      title: "Lunch & 2,500-step walk", start: "15:00", end: "16:00",
      description: "Take 10 minutes for a balanced lunch, then walk for the remaining 50 minutes. Record at least 2,500 steps from this walk; fewer than 2,500 means the quest fails.",
      habit: "walking", target: 2500, required: true, penalty: 5,
    });
    for (const quest of state.instances.filter(q => q.templateId === lunch.id && q.occurrence >= today && q.status !== "completed")) {
      Object.assign(quest, { title: lunch.title, start: lunch.start, end: lunch.end, description: lunch.description, habit: lunch.habit, target: lunch.target, required: lunch.required, penalty: lunch.penalty });
      quest.opensAt = utc(quest.occurrence, "15:00", quest.timezone);
      quest.dueAt = utc(quest.occurrence, "16:00", quest.timezone);
      quest.status = Date.parse(instant) >= Date.parse(quest.opensAt) ? "available" : "scheduled";
      for (const entry of state.ledger.filter(l => l.questId === quest.id && l.kind === "expiry" && !l.reversed)) entry.reversed = true;
    }
  }
  if (walk) walk.archived = true;
  const overlapsLunch = (q: { start: string }) => q.start >= "14:55" && q.start < "16:00";
  for (const template of state.templates.filter(t => t.id === walk?.id || (t.title === "Five-minute movement break" && overlapsLunch(t)))) {
    template.archived = true;
    for (const quest of state.instances.filter(q => q.templateId === template.id && q.occurrence >= today && q.status !== "completed")) quest.status = "cancelled";
  }
  state.audit.push({ id: randomUUID(), at: instant, action: "lunch-walk-v4", detail: "Combined lunch and walk into one 3:00–4:00 PM quest requiring 2,500 recorded walk steps; removed overlapping movement breaks." });
  save(state); await flush();
}
if (state && !state.audit.some(a => a.action === "quest-cleanup-v5")) {
  const instant = new Date().toISOString(), today = localDate(instant, state.settings.timezone);
  const lunch = state.templates.find(t => t.title === "Lunch & 2,500-step walk" || t.title === "Balanced lunch");
  if (lunch) {
    Object.assign(lunch, {
      title: "Lunch & 2,500-step walk", start: "15:00", end: "16:00",
      description: "Take 10 minutes for a balanced lunch, then walk for the remaining 50 minutes. Record at least 2,500 walk steps to complete this quest.",
      habit: "walking", target: 2500, required: true, penalty: 5, archived: false,
    });
    for (const quest of state.instances.filter(q => q.templateId === lunch.id && q.occurrence >= today)) {
      Object.assign(quest, { title: lunch.title, start: lunch.start, end: lunch.end, description: lunch.description, habit: lunch.habit, target: lunch.target, required: lunch.required, penalty: lunch.penalty });
      quest.opensAt = utc(quest.occurrence, lunch.start, quest.timezone);
      quest.dueAt = utc(quest.occurrence, lunch.end, quest.timezone);
      if (quest.status !== "completed") {
        quest.status = Date.parse(instant) >= Date.parse(quest.opensAt) ? "available" : "scheduled";
        for (const entry of state.ledger.filter(l => l.questId === quest.id && l.kind === "expiry" && !l.reversed)) entry.reversed = true;
      }
    }
  }
  const closeWorkday = state.templates.find(t => t.title === "Close the workday");
  if (closeWorkday) {
    closeWorkday.grace = 120;
    for (const quest of state.instances.filter(q => q.templateId === closeWorkday.id && q.occurrence >= today)) quest.grace = 120;
  }
  const remove = new Set(state.templates.filter(t =>
    t.title === "Lunchtime walk" || t.title === "Wind down" ||
    (t.title === "Five-minute movement break" && (t.start === "14:55" || t.start === "15:55")),
  ).map(t => t.id));
  for (const template of state.templates.filter(t => remove.has(t.id))) template.archived = true;
  state.instances = state.instances.filter(q => !(remove.has(q.templateId) && q.occurrence >= today));
  state.audit.push({ id: randomUUID(), at: instant, action: "quest-cleanup-v5", detail: "Removed duplicate 2:55 PM and 3:55 PM movement breaks, the separate lunchtime walk, and Wind down. Kept one lunch + 2,500-step walk and gave Close the workday a two-hour grace period." });
  save(state); await flush();
}
if (state && !state.audit.some(a => a.action === "active-rest-plan-v6")) {
  const instant = new Date().toISOString();
  const activeRestDay = "2026-11-04";
  const shower = state.templates.find(t => t.title === "Shower & breakfast");
  if (shower) {
    Object.assign(shower, { start: "09:00", end: "10:00", description: "Fresh clothes, two eggs and a balanced breakfast. Keep this daily block from 9:00 to 10:00 AM." });
    for (const quest of state.instances.filter(q => q.templateId === shower.id && q.occurrence >= activeRestDay)) {
      Object.assign(quest, { start: shower.start, end: shower.end, description: shower.description });
      quest.opensAt = utc(quest.occurrence, shower.start, quest.timezone);
      quest.dueAt = utc(quest.occurrence, shower.end, quest.timezone);
    }
  }
  const wake = state.templates.find(t => t.title === "Wake & reset");
  if (wake) for (const quest of state.instances.filter(q => q.templateId === wake.id && q.occurrence === activeRestDay && q.status !== "completed")) {
    Object.assign(quest, { title: "Wake at 6:30 AM", start: "06:30", end: "06:45", description: "Wake at 6:30 AM for active-rest-day basketball. Water, brush teeth, and get ready." });
    quest.opensAt = utc(activeRestDay, "06:30", quest.timezone);
    quest.dueAt = utc(activeRestDay, "06:45", quest.timezone);
  }
  const training = state.templates.find(t => t.title === "Morning training / planned recovery");
  if (training) for (const quest of state.instances.filter(q => q.templateId === training.id && q.occurrence === activeRestDay)) quest.status = "cancelled";
  let basketball = state.templates.find(t => t.id === "active-rest-basketball-2026-11-04");
  if (!basketball) {
    basketball = { ...templateSchema.parse({ title: "Active-rest basketball", description: "Play basketball from 7:00 to 8:30 AM. This is active recovery, so there is no separate morning training quest today.", category: "Endurance", habit: "training", difficulty: "normal", recurrence: "once", timezone: state.settings.timezone, start: "07:00", end: "08:30", startDate: activeRestDay, grace: 15, target: 1, reminderLead: 15, required: true, penalty: 5, archived: false }), id: "active-rest-basketball-2026-11-04", createdAt: instant };
    state.templates.push(basketball);
  }
  materialize(state, instant);
  state.audit.push({ id: randomUUID(), at: instant, action: "active-rest-plan-v6", detail: "Set 4 Nov 2026 as active rest: wake at 6:30 AM, basketball 7:00–8:30 AM, no separate morning training, and moved daily shower & breakfast to 9:00–10:00 AM." });
  save(state); await flush();
}
if (state && !state.audit.some(a => a.action === "active-rest-plan-v7")) {
  const instant = new Date().toISOString();
  const training = state.templates.find(t => t.title === "Morning training / planned recovery");
  if (training) for (const quest of state.instances.filter(q => q.templateId === training.id && q.occurrence === "2026-11-04")) {
    quest.status = "cancelled";
    for (const entry of state.ledger.filter(l => l.questId === quest.id && !l.reversed)) entry.reversed = true;
  }
  state.audit.push({ id: randomUUID(), at: instant, action: "active-rest-plan-v7", detail: "Cancelled the 4 Nov morning-training instance so active-rest basketball is the only morning exercise quest." });
  save(state); await flush();
}
if (!state) {
    const now = new Date().toISOString(),
      s = fresh(now);
    const seed: [string, string, string, string, string, boolean][] = [
      [
        "Wake & reset",
        "Recovery",
        "07:45",
        "08:00",
        "Brush teeth, water, prepare for the day.",
        false,
      ],
      [
        "Morning training / planned recovery",
        "Strength",
        "08:00",
        "09:00",
        "Follow your five-day cycle; choose rest when needed.",
        true,
      ],
      [
        "Shower & breakfast",
        "Recovery",
        "09:00",
        "09:45",
        "Fresh clothes, two eggs and a balanced breakfast.",
        false,
      ],
      [
        "Begin at your desk",
        "Focus",
        "10:00",
        "13:00",
        "Track actual desk minutes independently of your progression week.",
        true,
      ],
      [
        "Lunch & 2,500-step walk",
        "Endurance",
        "15:00",
        "16:00",
        "Take 10 minutes for a balanced lunch, then walk for 50 minutes and record at least 2,500 walk steps.",
        true,
      ],
      [
        "Close the workday",
        "Mobility",
        "18:30",
        "18:50",
        "One easy activity, adapted to fatigue and morning training.",
        true,
      ],
      [
        "Evening care & meditation",
        "Consistency",
        "22:30",
        "23:00",
        "Brush teeth, prepare clothes, five quiet minutes.",
        true,
      ],
    ];
    for (const h of ["10:55", "11:55", "16:55", "17:55"])
      seed.push([
        "Five-minute movement break",
        "Mobility",
        h,
        h.slice(0, 2) + ":59",
        "Walk on the terrace or do gentle mobility; no extra pulling on pull/arms days.",
        false,
      ]);
    s.templates = seed.map(
      ([title, category, start, end, description, required]) =>
        ({
          ...templateSchema.parse({
            title,
            category,
            start,
            end,
            description,
            required,
            difficulty: "easy",
            recurrence:
              title.includes("desk") || title.includes("break")
                ? "weekdays"
                : "daily",
            timezone: s.settings.timezone,
            startDate: s.settings.rotationAnchor,
            grace: title === "Close the workday" ? 120 : 15,
            penalty: required ? 5 : 0,
            habit: title === "Lunch & 2,500-step walk" ? "walking" : "general",
            target: title === "Lunch & 2,500-step walk" ? 2500 : 1,
          }),
          id: randomUUID(),
          createdAt: now,
        }) as Template,
    );
    materialize(s, now);
    save(s);
    await flush();
}
