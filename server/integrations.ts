import { OAuth2Client } from "google-auth-library";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { read, transaction, putRecord, getRecord, deleteRecords } from "./store.js";
import { templateSchema, totals, localDate, type State } from "../domain/model.js";
import { audit } from "../domain/engine.js";
const scope = "https://www.googleapis.com/auth/calendar.app.created";
export const calendarReady = () =>
  !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY?.match(/^[a-f0-9]{64}$/i)
  );
const client = () =>
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      "http://127.0.0.1:3001/api/calendar/callback",
  );
function encrypt(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex"),
      iv,
    );
  return JSON.stringify({
    iv: iv.toString("hex"),
    data: Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]).toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  });
}
function decrypt(value: string) {
  const v = JSON.parse(value),
    dec = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex"),
      Buffer.from(v.iv, "hex"),
    );
  dec.setAuthTag(Buffer.from(v.tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      dec.update(Buffer.from(v.data, "hex")),
      dec.final(),
    ]).toString(),
  );
}
export async function connection() { const data = await getRecord<string>("integration_connections", "google"); return data ? { data } : undefined; }
export async function connect() {
  if (!calendarReady())
    throw Error(
      "Configure Google client credentials and a 32-byte TOKEN_ENCRYPTION_KEY first",
    );
  const c = client(),
    state = randomBytes(32).toString("hex"),
    pkce = await c.generateCodeVerifierAsync();
  await putRecord("integration_connections", "oauth", {
      state,
      verifier: pkce.codeVerifier,
      expires: Date.now() + 600000,
    });
  return c.generateAuthUrl({
    scope: [scope],
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256" as any,
  });
}
export async function callback(code: string, state: string) {
  const pending = await getRecord<any>("integration_connections", "oauth");
  if (!pending) throw Error("Missing OAuth session");
  if (pending.state !== state || pending.expires < Date.now())
    throw Error("Invalid or expired OAuth state");
  await deleteRecords("integration_connections", ["oauth"]);
  const c = client();
  const { tokens } = await c.getToken({ code, codeVerifier: pending.verifier });
  await putRecord("integration_connections", "google", encrypt(tokens));
}
async function authorized() {
  const row = await connection();
  if (!row) throw Error("Google Calendar is not connected");
  const c = client();
  c.setCredentials(decrypt(row.data));
  c.on("tokens", async (tokens) => {
    const current = await connection(); if (!current) return;
    const old = decrypt(current.data);
    await putRecord("integration_connections", "google", encrypt({ ...old, ...tokens }));
  });
  return c;
}
export async function disconnect() {
  const c = await authorized();
  await c.revokeCredentials();
  await deleteRecords("integration_connections", ["google", "oauth"]);
}
export async function sync() {
  const c = await authorized();
  const r = await getRecord<{ id: string }>("integration_connections", "calendar");
  let calendarId = r?.id || "";
  if (!calendarId) {
    const res = await c.request<any>({
      url: "https://www.googleapis.com/calendar/v3/calendars",
      method: "POST",
      data: { summary: "Level Up", timeZone: read().settings.timezone },
    });
    calendarId = res.data.id;
    await putRecord("integration_connections", "calendar", { id: calendarId });
  }
  const s = read();
  let count = 0;
  for (const q of s.instances.filter(
    (q) => Date.parse(q.dueAt) >= Date.now() - 86400000,
  )) {
    const id = createHash("sha256").update(q.id).digest("hex");
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const mapped = await getRecord("calendar_event_mappings", q.id);
    const selected =
      s.settings.calendarCategories.includes(q.category) &&
      !["cancelled", "excused"].includes(q.status);
    if (!selected) {
      if (mapped) {
        await c
          .request({ url: `${base}/${id}`, method: "DELETE" })
          .catch((e: any) => {
            if (e.response?.status !== 404 && e.response?.status !== 410)
              throw e;
          });
        await deleteRecords("calendar_event_mappings", [q.id]);
      }
      continue;
    }
    const data = {
      summary: q.title,
      description: q.description + "\nCompletion is tracked only in Level Up.",
      start: { dateTime: q.opensAt, timeZone: q.timezone },
      end: { dateTime: q.dueAt, timeZone: q.timezone },
    };
    try {
      if (mapped)
        await c.request({ url: `${base}/${id}`, method: "PUT", data });
      else
        await c.request({ url: base, method: "POST", data: { ...data, id } });
    } catch (e: any) {
      if (e.response?.status === 409)
        await c.request({ url: `${base}/${id}`, method: "PUT", data });
      else
        throw Error(
          `Calendar sync failed (${e.response?.status ?? "network"}). Retry Sync; stable IDs prevent duplicate events.`,
        );
    }
    await putRecord("calendar_event_mappings", q.id, { calendarId, eventId: id });
    count++;
  }
  transaction((s) =>
    audit(
      s,
      new Date().toISOString(),
      "calendar-sync",
      `${count} selected events synchronized`,
    ),
  );
  return count;
}
const proposal = z
  .object({
    title: z.string().min(1).max(120),
    category: templateSchema.shape.category,
    difficulty: templateSchema.shape.difficulty,
    duration: z.number().int().min(5).max(20),
    window: z.object({
      start: templateSchema.shape.start,
      end: templateSchema.shape.end,
    }),
    reason: z.string().max(500),
    recoveryAlternative: z.string().min(1).max(500),
  })
  .strict();
const proposalResponse = z
  .object({ proposals: z.array(proposal).max(2) })
  .strict();
export const proposalJSONSchema = z.toJSONSchema(proposalResponse);
export async function proposals(consent: boolean) {
  const s = read();
  if (!s.settings.aiEnabled || !consent)
    throw Error(
      "Enable AI and explicitly consent to sending your selected routine preferences",
    );
  if (!process.env.AI_ENDPOINT || !process.env.AI_MODEL)
    throw Error("Configure AI_ENDPOINT and AI_MODEL on the server");
  const today = new Date().toISOString().slice(0, 10);
  if (
    s.audit.filter((a) => a.action === "ai-request" && a.at.startsWith(today))
      .length >= 5
  )
    throw Error("Daily limit: five requests");
  transaction((s) =>
    audit(
      s,
      new Date().toISOString(),
      "ai-request",
      "Sent category preferences and routine times only; no measurements, logs or identity",
    ),
  );
  const endpoint = process.env.AI_ENDPOINT;
  const body = {
    model: process.env.AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          'Return JSON only: {"proposals":[{title,category,difficulty,duration,window:{start,end},reason,recoveryAlternative}]}. Maximum 2 gentle non-training habits. Categories Focus, Recovery, Consistency. Difficulty easy. Duration 5–20 minutes. Never prescribe food restriction, weight loss, pain, punishment or extra exercise. JSON Schema: ' +
          JSON.stringify(proposalJSONSchema),
      },
      {
        role: "user",
        content: JSON.stringify({
          wake: s.settings.wake,
          workStart: s.settings.workStart,
          workEnd: s.settings.workEnd,
          preferences: [
            "meditation",
            "hygiene",
            "skill study",
            "balanced meals",
          ],
        }),
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_API_KEY
        ? { Authorization: `Bearer ${process.env.AI_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(
      `AI provider returned ${response.status}; your deterministic routine is unchanged`,
    );
  const raw = (await response.json()) as any;
  const list = proposalResponse.parse(
    JSON.parse(raw.choices?.[0]?.message?.content ?? "{}"),
  ).proposals;
  for (const p of list) {
    if (
      !["Focus", "Recovery", "Consistency"].includes(p.category) ||
      p.difficulty !== "easy" ||
      /pull.?up|handstand|workout|fasting|calori|punish|weight loss|skip.*meal/i.test(
        JSON.stringify(p),
      )
    )
      throw Error("Proposal rejected by recovery/workload rules");
    const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
    if (minutes(p.window.end) - minutes(p.window.start) < p.duration)
      throw Error("Proposal window is too short");
    if (
      s.templates.some(
        (t) => !t.archived && t.start < p.window.end && t.end > p.window.start,
      )
    )
      throw Error("Proposal overlaps an existing routine");
  }
  return list;
}
export async function chat(message: string) {
  if (!process.env.GEMINI_API_KEY) throw Error("Configure GEMINI_API_KEY on the server");
  const s = read(), now = new Date().toISOString(), today = localDate(now, s.settings.timezone);
  const quests = s.instances.filter(q => q.occurrence === today).map(q => ({ title: q.title, status: q.status, starts: q.opensAt, due: q.dueAt }));
  const recent = s.logs.slice(-7).map(l => ({ date: l.date, sleep: l.sleep, weight: l.weight, steps: l.steps, fatigue: l.fatigue }));
  const prompt = `You are the private Level Up game assistant. Answer concisely and practically. Never claim medical certainty. Current instant: ${now}; timezone: ${s.settings.timezone}. Player totals: ${JSON.stringify(totals(s))}. Today's quests: ${JSON.stringify(quests)}. Recent self-reported logs: ${JSON.stringify(recent)}. User: ${message}`;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 700 } }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Gemini returned ${response.status}`);
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "I could not generate a response.";
}
export async function randomAdventure() {
  const fallback = ["Bagh Bhairab Temple", "a nearby temple early in the morning", "the Jholunge Pul", "Tribhuvan University grounds"];
  if (!process.env.GEMINI_API_KEY) return fallback[Math.floor(Math.random() * fallback.length)];
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: "Suggest exactly one safe, public, low-cost photo-adventure destination in or near Kirtipur, Nepal. Return only the place name, maximum 80 characters. Do not suggest restricted or dangerous places." }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 40 } }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) return fallback[Math.floor(Math.random() * fallback.length)];
  const data = await response.json() as any, place = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().replace(/[\r\n"*]/g, "").slice(0, 80);
  return place || fallback[Math.floor(Math.random() * fallback.length)];
}
export function ics(s: State) {
  const escape = (v: string) =>
    v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const stamp = (v: string) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Level Up//Local//EN",
    "CALSCALE:GREGORIAN",
    ...s.instances
      .filter(
        (q) =>
          !["cancelled", "excused"].includes(q.status) &&
          s.settings.calendarCategories.includes(q.category),
      )
      .flatMap((q) => [
        "BEGIN:VEVENT",
        `UID:${q.id}@levelup.local`,
        `DTSTAMP:${stamp(s.createdAt)}`,
        `DTSTART:${stamp(q.opensAt)}`,
        `DTEND:${stamp(q.dueAt)}`,
        `SUMMARY:${escape(q.title)}`,
        `DESCRIPTION:${escape(q.description + " (Snapshot; completion is tracked in Level Up)")}`,
        "END:VEVENT",
      ]),
    "END:VCALENDAR",
  ].join("\r\n");
}
