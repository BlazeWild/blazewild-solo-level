import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
import { fresh, templateSchema } from "../../domain/model";
import { materialize } from "../../domain/engine";
const headers = { "X-Level-Up": "local" };
test.beforeEach(async ({ request }) => {
  const now = new Date().toISOString(),
    s = fresh(now);
  const day = DateTime.now().setZone("Asia/Kathmandu").toISODate()!;
  s.templates = [
    {
      ...templateSchema.parse({
        title: "Browser test quest",
        category: "Focus",
        difficulty: "normal",
        recurrence: "once",
        timezone: "Asia/Kathmandu",
        start: "00:00",
        end: "23:59",
        startDate: day,
        grace: 15,
        required: true,
        penalty: 5,
      }),
      id: "browser",
      createdAt: now,
    },
  ];
  materialize(s, now);
  const preview = await request.post("/api/backup/preview", {
    headers,
    data: s,
  });
  expect(preview.ok()).toBeTruthy();
  const { token } = await preview.json();
  expect(
    (
      await request.post("/api/backup/restore", { headers, data: { token } })
    ).ok(),
  ).toBeTruthy();
});
test("complete, undo, repeated requests, reload and another tab preserve scores", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Complete Browser test quest", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo Browser test quest", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Undo Browser test quest", exact: true }),
  ).toBeEnabled();
  const b = await context.newPage();
  await b.goto("/");
  await expect(
    b.getByRole("button", { name: "Undo Browser test quest", exact: true }),
  ).toBeEnabled();
  const state = await (await request.get("/api/state")).json(),
    id = state.instances[0].id;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      request.post(`/api/quests/${encodeURIComponent(id)}/complete`, {
        headers,
        data: {},
      }),
    ),
  );
  expect((await (await request.get("/api/state")).json()).totals.lifetime).toBe(
    20,
  );
  await page
    .getByRole("button", { name: "Undo Browser test quest", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete Browser test quest", exact: true })
    .click();
  expect((await (await request.get("/api/state")).json()).totals.lifetime).toBe(
    20,
  );
});
test("create edit duplicate archive templates and reschedule", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByRole("button", { name: "New quest", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Read one chapter");
  await page.getByLabel("Start time", { exact: true }).fill("00:00");
  await page.getByLabel("End time", { exact: true }).fill("23:59");
  await page.getByRole("button", { name: "Save quest", exact: true }).click();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Read one chapter", exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Read two pages");
  await page.getByRole("button", { name: "Save quest", exact: true }).click();
  const changed = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Read two pages", exact: true }),
  });
  await changed.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByRole("button", { name: "Save quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Read two pages (copy)", exact: true }),
  ).toBeVisible();
  await changed.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(changed).toContainText("ARCHIVED");
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const quest = page
    .locator(".quest")
    .filter({ has: page.getByText("Browser test quest", { exact: true }) });
  await quest.getByRole("button", { name: "Reschedule", exact: true }).click();
  const future = DateTime.now().setZone("Asia/Kathmandu").plus({ days: 1 });
  await page
    .getByLabel("Opens at")
    .fill(future.set({ hour: 10, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await page
    .getByLabel("Due at")
    .fill(future.set({ hour: 11, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await page.getByRole("button", { name: "Save new window" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("expired quest correction, settings, measurement charts and restore preview", async ({
  page,
  request,
}) => {
  let s = await (await request.get("/api/backup")).json();
  s.instances[0].opensAt = new Date(Date.now() - 7200000).toISOString();
  s.instances[0].dueAt = new Date(Date.now() - 3600000).toISOString();
  s.instances[0].grace = 0;
  let p = await (
    await request.post("/api/backup/preview", { headers, data: s })
  ).json();
  await request.post("/api/backup/restore", {
    headers,
    data: { token: p.token },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "I did this on time", exact: true })
    .click();
  await page
    .getByLabel("Audit note")
    .fill("Finished on time before opening the app");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByRole("button", { name: "Undo Browser test quest", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("78.5");
  await page.getByLabel("Steps (manual)", { exact: true }).fill("6000");
  await page.getByRole("button", { name: "Save log", exact: true }).click();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weight & 7-day average" }),
  ).toBeVisible();
  await page
    .locator(".chart-card")
    .first()
    .getByText("View data table")
    .click();
  await expect(page.locator(".chart-card").first()).toContainText("78.5");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Asok Test");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make today count, Asok Test." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const backup = await (await request.get("/api/backup")).json();
  await page.getByLabel("Preview backup / prototype import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByRole("heading", { name: "Review replacement" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replace local data", exact: true })
    .click();
  expect((await (await request.get("/api/state")).json()).totals.lifetime).toBe(
    20,
  );
});
test("mobile navigation, timer persistence, offline failure, no browser exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start 5-minute break", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume timer", exact: true }),
  ).toBeVisible();
  for (const tab of [
    "Character",
    "Nutrition",
    "Weekly review",
    "Settings",
    "Today",
  ])
    await page.getByRole("button", { name: tab, exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Complete Browser test quest", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.context().setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Complete Browser test quest",
      exact: true,
    }),
  ).toBeEnabled();
});
test("local API denies cross-origin writes and malformed data", async ({
  request,
}) => {
  expect((await request.post("/api/reconcile", { data: {} })).status()).toBe(
    403,
  );
  expect(
    (
      await request.post("/api/reconcile", {
        headers: { ...headers, Origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/templates", { headers, data: { title: "" } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/backup/preview", {
        headers,
        data: { version: 2 },
      })
    ).status(),
  ).toBe(400);
});
test("browser jobs deduplicate across tabs and calendar snapshots retain stable UIDs", async ({
  request,
}) => {
  const state = await (await request.get("/api/state")).json();
  await request.put("/api/settings", {
    headers,
    data: { ...state.settings, notifications: "browser" },
  });
  await request.post("/api/notifications/test", { headers, data: {} });
  const claims = await Promise.all([
    request.post("/api/notifications/claim", { headers, data: {} }),
    request.post("/api/notifications/claim", { headers, data: {} }),
  ]);
  const jobs = (await Promise.all(claims.map((r) => r.json()))).flat();
  expect(jobs.filter((j) => j.questId === "test")).toHaveLength(1);
  await request.post(
    `/api/notifications/${encodeURIComponent(jobs[0].id)}/ack`,
    { headers, data: { success: false, error: "Permission denied fixture" } },
  );
  expect(
    (await (await request.get("/api/state")).json()).jobs.some(
      (j: any) => j.status === "failed",
    ),
  ).toBeTruthy();
  const a = await (await request.get("/api/calendar.ics")).text(),
    b = await (await request.get("/api/calendar.ics")).text();
  expect(a).toContain("BEGIN:VCALENDAR");
  expect(a).toContain("UID:browser:");
  expect(a).toEqual(b);
  expect(
    (
      await request.post("/api/ai/proposals", {
        headers,
        data: { consent: true },
      })
    ).status(),
  ).toBe(400);
});
test("independent scheduler expires quests while no page is open", async ({
  request,
}) => {
  const s = await (await request.get("/api/backup")).json();
  s.instances[0].opensAt = new Date(Date.now() - 7200000).toISOString();
  s.instances[0].dueAt = new Date(Date.now() - 3600000).toISOString();
  s.instances[0].grace = 0;
  const p = await (
    await request.post("/api/backup/preview", { headers, data: s })
  ).json();
  await request.post("/api/backup/restore", {
    headers,
    data: { token: p.token },
  });
  await expect
    .poll(
      async () => {
        const backup = await (await request.get("/api/backup")).json();
        return backup.instances[0].status;
      },
      { timeout: 22000, intervals: [1000] },
    )
    .toBe("missed");
  const result = await (await request.get("/api/backup")).json();
  expect(result.ledger.filter((l: any) => l.kind === "expiry")).toHaveLength(1);
});
