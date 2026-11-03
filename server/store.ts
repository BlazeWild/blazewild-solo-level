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
export async function putProof(id: string, questId: string, mime: string, bytes: Buffer) { await sql`INSERT INTO quest_proofs(id,quest_id,mime_type,bytes) VALUES (${id},${questId},${mime},${bytes})`; }
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
        "Balanced lunch",
        "Recovery",
        "15:00",
        "15:10",
        "Include protein, vegetables and a comfortable rice portion.",
        false,
      ],
      [
        "Lunchtime walk",
        "Endurance",
        "15:10",
        "16:00",
        "A relaxed walk during the rest of your afternoon break.",
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
      [
        "Wind down",
        "Recovery",
        "23:00",
        "23:45",
        "Make space for sleep.",
        false,
      ],
    ];
    for (const h of ["10:55", "11:55", "14:55", "15:55", "16:55", "17:55"])
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
            grace: 15,
            penalty: required ? 5 : 0,
          }),
          id: randomUUID(),
          createdAt: now,
        }) as Template,
    );
    materialize(s, now);
    save(s);
    await flush();
}
