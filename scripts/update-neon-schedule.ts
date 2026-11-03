import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { localDate, utc, type State } from "../domain/model.js";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL), rows = await sql`SELECT data FROM app_state WHERE id='owner'`;
if (!rows[0]) throw Error("Owner state is missing in Neon");
const state = rows[0].data as State, instant = new Date().toISOString(), today = localDate(instant, state.settings.timezone);
state.settings.lunch = "15:00";
const schedule = new Map([["Balanced lunch", ["15:00", "15:10", "Take ten calm minutes for a balanced lunch during your 3–4 PM break."]], ["Lunchtime walk", ["15:10", "16:00", "Use the remaining break for a relaxed walk."]]]);
let changed = 0;
for (const template of state.templates) {
  const update = schedule.get(template.title); if (!update) continue;
  [template.start, template.end, template.description] = update; changed++;
  for (const quest of state.instances.filter(q => q.templateId === template.id && q.occurrence >= today && q.status !== "completed")) {
    quest.start = update[0]; quest.end = update[1]; quest.description = update[2];
    quest.opensAt = utc(quest.occurrence, update[0], quest.timezone); quest.dueAt = utc(quest.occurrence, update[1], quest.timezone);
    quest.status = Date.parse(instant) >= Date.parse(quest.opensAt) ? "available" : "scheduled";
    for (const entry of state.ledger.filter(l => l.questId === quest.id && l.kind === "expiry" && !l.reversed)) entry.reversed = true;
  }
}
state.audit.push({ id: crypto.randomUUID(), at: instant, action: "schedule-migration", detail: "Break moved to 3:00–4:00 PM Nepal time: lunch 3:00–3:10, walk 3:10–4:00; old open-instance penalties reversed." });
await sql`UPDATE app_state SET data=${JSON.stringify(state)}::jsonb, updated_at=now() WHERE id='owner'`;
console.log(`Updated ${changed} Neon templates and their open instances for ${today} onward.`);
