import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fresh, templateSchema, totals } from "../domain/model.js";
import { materialize } from "../domain/engine.js";
test("SQLite serializes competing processes and restart retains unique awards", async () => {
  const dir = mkdtempSync(join(tmpdir(), "levelup-test-"));
  process.env.DB_PATH = join(dir, "test.sqlite");
  const { db, save, read } = await import("../server/store.js");
  const s = fresh("2026-12-31T03:00:00.000Z");
  s.templates.push({
    ...templateSchema.parse({
      title: "Race",
      category: "Focus",
      difficulty: "hard",
      recurrence: "once",
      timezone: "Asia/Kathmandu",
      start: "10:00",
      end: "11:00",
      startDate: "2026-12-31",
      grace: 15,
      required: true,
      penalty: 5,
    }),
    id: "race",
    createdAt: s.createdAt,
  });
  materialize(s, s.createdAt);
  db.transaction(() => save(s)).immediate();
  const store = resolve("server/store.ts"),
    engine = resolve("domain/engine.ts");
  const source = `import {transaction,db} from ${JSON.stringify(store)};import {act} from ${JSON.stringify(engine)};transaction(s=>act(s,'race:2026-12-31','complete','2026-12-31T04:30:00.000Z'));db.close();`;
  await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        new Promise<void>((ok, bad) => {
          const p = spawn(
            process.execPath,
            ["--import", "tsx", "--input-type=module", "-e", source],
            { env: process.env, stdio: ["ignore", "ignore", "pipe"] },
          );
          let err = "";
          p.stderr.on("data", (d) => (err += d));
          p.on("exit", (code) => (code === 0 ? ok() : bad(Error(err))));
        }),
    ),
  );
  assert.equal(totals(read()).lifetime, 30);
  assert.equal(totals(read()).xp, 30);
  assert.equal(read().ledger.filter((l) => l.kind === "completion").length, 1);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
