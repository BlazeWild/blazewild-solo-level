import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import webpush from "web-push";
import { transaction, listRecords, putRecord } from "./store.js";
import { type State } from "../domain/model.js";
export const pushConfigured = () =>
  !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT?.startsWith("mailto:")
  );
export function notificationCopy(s: State, questId: string, kind?: string) {
  const q = s.instances.find((item) => item.id === questId);
  if (!q) return { title: "Level Up test notification", body: "Your browser notifications are working." };
  const time = (value: string) =>
    DateTime.fromISO(value).setZone(s.settings.timezone).toFormat("h:mm a");
  if (kind === "lead")
    return { title: `Coming up: ${q.title}`, body: `Starts at ${time(q.opensAt)}. ${q.reminderLead} minutes to get ready.` };
  if (kind === "start")
    return { title: `Quest available: ${q.title}`, body: `You can start now. Quest window ends at ${time(q.dueAt)}.` };
  if (kind === "due")
    return q.grace > 0
      ? { title: `Grace period: ${q.title}`, body: `The quest window ended at ${time(q.dueAt)}. Complete it by ${time(DateTime.fromISO(q.dueAt).plus({ minutes: q.grace }).toISO()!)}.` }
      : { title: `Quest ended: ${q.title}`, body: `The quest window ended at ${time(q.dueAt)}.` };
  if (kind === "snooze")
    return { title: `Snooze finished: ${q.title}`, body: `Your quest is waiting. Deadline: ${time(q.dueAt)}.` };
  return { title: q.title, body: `Quest window: ${time(q.opensAt)}–${time(q.dueAt)}.` };
}
export function queue(s: State, now: string) {
  if (s.settings.notifications === "off" || s.gapPending) return;
  // Do not generate jobs guaranteed to fail before Web Push is configured.
  if (s.settings.notifications === "push" && !pushConfigured()) return;
  const local = DateTime.fromISO(now)
    .setZone(s.settings.timezone)
    .toFormat("HH:mm");
  const { quietStart: a, quietEnd: b } = s.settings;
  if (
    (a < b ? local >= a && local < b : local >= a || local < b) ||
    Date.parse(s.settings.focusUntil) > Date.parse(now)
  )
    return;
  for (const q of s.instances) {
    if (!["scheduled", "available"].includes(q.status)) continue;
    for (const [kind, at] of [
      ["lead", Date.parse(q.opensAt) - q.reminderLead * 60000],
      ["start", Date.parse(q.opensAt)],
      ["due", Date.parse(q.dueAt)],
      ...(q.snoozeUntil ? [["snooze", Date.parse(q.snoozeUntil)]] : []),
    ] as [string, number][]) {
      if (
        Date.parse(now) < at ||
        Date.parse(now) - at > 10 * 60000 ||
        (q.snoozeUntil && Date.parse(q.snoozeUntil) > Date.parse(now))
      )
        continue;
      const id = `${q.id}:${q.generation}:${kind}:${kind === "snooze" ? at : ""}`;
      if (!s.jobs.some((j) => j.id === id))
        s.jobs.push({
          id,
          questId: q.id,
          at: now,
          status: "pending",
          channel: s.settings.notifications,
          kind: kind as "lead" | "start" | "due" | "snooze",
        });
    }
  }
}
export async function deliver() {
  const jobs = transaction((s) => {
    const pending = s.jobs.filter(
      (j) => j.status === "pending" && j.channel !== "browser",
    );
    for (const j of pending) j.status = "sending";
    return pending.map((j) => ({
      ...j,
      ...notificationCopy(s, j.questId, j.kind),
    }));
  });
  for (const j of jobs) {
    let error = "";
    try {
      if (j.channel === "desktop") {
        if (process.env.DESKTOP_NOTIFICATIONS !== "true")
          throw Error(
            "Set DESKTOP_NOTIFICATIONS=true and provide a graphical session environment",
          );
        await promisify(execFile)(
          "notify-send",
          ["--app-name=Level Up", j.title, j.body],
          { timeout: 5000 },
        );
      } else if (j.channel === "push") {
        if (!pushConfigured())
          throw Error("VAPID keys are not configured");
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT!,
          process.env.VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );
        const rows = await listRecords<any>("push_subscriptions");
        if (!rows.length) throw Error("No push subscription");
        for (const r of rows)
          await webpush.sendNotification(
            r,
            JSON.stringify({
              title: j.title,
              body: j.body,
              tag: j.id,
            }),
            { TTL: 600, timeout: 5000 },
          );
      } else throw Error("Unknown notification channel");
    } catch (e) {
      error = (e as Error).message;
    }
    transaction((s) => {
      const job = s.jobs.find((x) => x.id === j.id);
      if (job) {
        job.status = error ? "failed" : "sent";
        job.error = error || undefined;
      }
    });
    await putRecord("delivery_attempts", randomUUID(), {
        job: j.id,
        at: new Date().toISOString(),
        status: error ? "failed" : "sent",
        error,
      });
  }
}
