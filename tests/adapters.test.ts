import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { fresh, templateSchema } from "../domain/model.js";
import { materialize } from "../domain/engine.js";
test("optional adapters: fixture-only AI schema/privacy/limits, OAuth state, notification dedup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "levelup-adapters-"));
  process.env.DB_PATH = join(dir, "test.sqlite");
  const store = await import("../server/store.js");
  const integrations = await import("../server/integrations.js");
  const { queue } = await import("../server/notifications.js");
  const now = "2026-12-31T03:00:00.000Z";
  const s = fresh(now);
  s.settings.aiEnabled = true;
  store.db.transaction(() => store.save(s)).immediate();
  let captured: any;
  let invalid = false;
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    captured = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                proposals: [
                  {
                    title: invalid ? "Punishing workout" : "Read quietly",
                    category: "Focus",
                    difficulty: "easy",
                    duration: 5,
                    window: { start: "20:00", end: "20:05" },
                    reason: "A short study habit",
                    recoveryAlternative: "Rest instead",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((ok) => provider.listen(0, "127.0.0.1", ok));
  const address = provider.address() as any;
  process.env.AI_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.AI_MODEL = "fixture-model";
  try {
    const list = await integrations.proposals(true);
    assert.equal(list.length, 1);
    assert.ok(captured.messages[0].content.includes("JSON Schema:"));
    assert.ok(!captured.messages[1].content.includes("Asok"));
    assert.ok(!captured.messages[1].content.includes("weight"));
    assert.equal(store.read().templates.length, 0);
    assert.equal(store.read().ledger.length, 0);
    invalid = true;
    await assert.rejects(
      () => integrations.proposals(true),
      /recovery\/workload/,
    );
    invalid = false;
    await integrations.proposals(true);
    await integrations.proposals(true);
    await integrations.proposals(true);
    await assert.rejects(() => integrations.proposals(true), /Daily limit/);
    await assert.rejects(() => integrations.proposals(false), /consent/);
    process.env.GOOGLE_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CLIENT_SECRET = "fixture-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const url = new URL(await integrations.connect());
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(
      url.searchParams.get("scope"),
      "https://www.googleapis.com/auth/calendar.app.created",
    );
    await assert.rejects(
      () => integrations.callback("unused", "wrong-state"),
      /Invalid or expired/,
    );
    s.settings.notifications = "browser";
    s.templates = [
      {
        ...templateSchema.parse({
          title: "Study",
          category: "Focus",
          difficulty: "easy",
          recurrence: "once",
          timezone: "Asia/Kathmandu",
          start: "10:00",
          end: "10:30",
          startDate: "2026-12-31",
          grace: 15,
          required: true,
          penalty: 5,
        }),
        id: "notification",
        createdAt: now,
      },
    ];
    materialize(s, now);
    queue(s, "2026-12-31T04:10:00.000Z");
    queue(s, "2026-12-31T04:10:01.000Z");
    assert.equal(s.jobs.length, 1);
    const copy = structuredClone(s);
    copy.jobs = [];
    copy.settings.quietStart = "09:00";
    copy.settings.quietEnd = "11:00";
    queue(copy, "2026-12-31T04:10:00.000Z");
    assert.equal(copy.jobs.length, 0);
    assert.equal(integrations.ics(s), integrations.ics(s));
    assert.ok(integrations.ics(s).includes("DTSTART:20261231T041500Z"));
  } finally {
    provider.close();
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
