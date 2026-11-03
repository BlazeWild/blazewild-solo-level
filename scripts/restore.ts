import { readFileSync } from "node:fs";
import { read, save, flush, putRecord } from "../server/store.js";
import { parseBackup } from "../server/backup.js";
import { audit } from "../domain/engine.js";
const path = process.argv[2];
if (!path) throw Error("Usage: npm run restore -- backup.json [--apply]");
const s = parseBackup(
  JSON.parse(readFileSync(path, "utf8")),
  new Date().toISOString(),
);
console.log(
  `Validated replacement: ${s.logs.length} logs, ${s.instances.length} quests, ${s.ledger.length} ledger entries.`,
);
if (process.argv.includes("--apply")) {
  const backup = `cli-pre-import-${Date.now()}`;
  await putRecord("backups", backup, read());
  console.log("Pre-import backup:", backup);
    audit(s, new Date().toISOString(), "restore", "CLI validated replacement");
    save(s);
  await flush();
  console.log("Restore complete.");
} else console.log("Preview only. Add --apply to replace local tracking data.");
