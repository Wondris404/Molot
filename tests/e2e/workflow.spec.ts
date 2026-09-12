import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/types";
import { localDate } from "../../lib/format";

test.beforeEach(async ({ request }) => { await request.patch("/api/global/profile", { data: { name: "TEST User", modules: ["school"], mainGoal: "", onboardingComplete: true } }); });

test.afterEach(async ({ request }, testInfo) => {
  // The server uses an isolated, newly created database; clean only this test's subjects.
  const data = (await (await request.get("/api/data")).json()) as Snapshot;
  for (const subject of data.subjects.filter(
    (s) =>
      s.name === `TEST ${testInfo.project.name} Matematika` ||
      s.name === `TEST ${testInfo.project.name} Upload`,
  )) {
    await request.delete("/api/data/subjects", { data: { id: subject.id } });
  }
});

async function saveDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test("complete school workflow, CRUD, charts, local upload and refresh", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const subject = `TEST ${testInfo.project.name} Matematika`;
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Pridať predmet", exact: true })
    .click();
  await page.getByLabel("Názov predmetu").fill(subject);
  await saveDialog(page);
  await expect(
    page.locator("main").getByText(subject, { exact: true }),
  ).toBeVisible();
  await page.goto("/grades");
  await page
    .getByRole("button", { name: "Pridať známku", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Predmet")
    .selectOption({ label: subject });
  await page.getByRole("spinbutton", { name: /^Známka/ }).fill("2");
  await page.getByLabel("Váha").fill("2");
  await page.getByLabel("Popis").fill("TEST prvá známka");
  await saveDialog(page);
  await expect(page.locator(".stat-value").first()).toHaveText("2");
  await page.goto("/tests");
  await page
    .getByRole("button", { name: "Pridať test", exact: true })
    .first()
    .click();
  await page.getByLabel("Názov testu").fill("TEST Lineárne rovnice");
  await page
    .getByRole("dialog")
    .getByLabel("Predmet", { exact: false })
    .selectOption({ label: subject });
  await page.getByLabel("Dátum", { exact: false }).fill(localDate());
  await page.getByLabel("Témy", { exact: false }).fill("Rovnice");
  await page.getByLabel("Plánovaný čas učenia").fill("240");
  await page.getByLabel("Úvodná pripravenosť").fill("30");
  await saveDialog(page);
  await page
    .getByRole("link", { name: "TEST Lineárne rovnice", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tests\/[0-9a-f-]+$/);
  const testUrl = page.url();
  await page
    .getByRole("button", { name: "Zapísať učenie", exact: true })
    .first()
    .click();
  await page.getByLabel("Dĺžka učenia").fill("120");
  await page.getByLabel("Téma učenia").fill("TEST Precvičovanie rovníc");
  await saveDialog(page);
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Už odštudované" })
      .locator(".stat-value"),
  ).toHaveText("2 h");
  await page
    .getByRole("button", { name: "Zaznamenať pripravenosť", exact: true })
    .click();
  await page.getByRole("slider").fill("80");
  await saveDialog(page);
  await page
    .getByRole("button", { name: "Pridať výsledok", exact: true })
    .click();
  await page.getByLabel("Získané body").fill("42");
  await page.getByLabel("Maximálne body").fill("50");
  await expect(page.getByLabel("Výsledok (%)", { exact: false })).toHaveValue(
    "84",
  );
  await page.getByLabel("Známka (voliteľná)").fill("2");
  await saveDialog(page);
  await expect(page.locator("main .status")).toHaveText("Vyhodnotený");
  await page.getByLabel("Vybrať materiál").setInputFiles({
    name: "TEST-worksheet.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("1. Vyries rovnicu x + 2 = 5.\n2. Kolko je 2 + 2?"),
  });
  await page
    .getByRole("button", { name: "Nahrať materiál", exact: true })
    .click();
  await expect(
    page.getByText("TEST-worksheet.txt", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zobraziť: TEST-worksheet.txt", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("iframe")).toBeVisible();
  await page
    .getByRole("button", { name: "Označiť odpoveď", exact: true })
    .click();
  await page.getByLabel("Otázka / číslo úlohy").fill("TEST Otázka 1");
  await page
    .getByRole("dialog")
    .getByLabel("Téma", { exact: false })
    .first()
    .fill("Rovnice");
  await page.getByLabel("Typ chyby").selectOption("calculation");
  await saveDialog(page);
  await page
    .getByRole("button", { name: "Pridať odpoveď / chybu", exact: true })
    .first()
    .click();
  await page.getByLabel("Otázka / číslo úlohy").fill("TEST Otázka 2");
  await page
    .getByRole("dialog")
    .getByLabel("Téma", { exact: false })
    .first()
    .fill("Rovnice");
  await page.getByLabel("Správnosť odpovede").selectOption("true");
  await saveDialog(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "TEST Lineárne rovnice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /^TEST Otázka 1 Rovnice/ }),
  ).toBeVisible();
  await page.goto("/errors");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Úspešnosť odpovedí" })
      .locator(".stat-value"),
  ).toHaveText("50 %");
  await page.goto("/charts");
  await expect(page.locator(".chart-shell")).toHaveCount(14);
  await expect(page.locator(".recharts-scatter-symbol")).toHaveCount(2);
  const firstChart = page.locator(".chart-shell").first();
  await firstChart.locator(".recharts-dot").first().hover();
  await expect(page.locator(".chart-tooltip").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("charts.png"),
    fullPage: true,
  });
  await page.goto("/");
  const live = (await (await request.get("/api/data")).json()) as Snapshot;
  const activeSubject = live.subjects.find((s) => s.name === subject)!;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const future = await request.post("/api/data/tests", {
    data: {
      subjectId: activeSubject.id,
      title: "TEST Ďalší test",
      date: localDate(tomorrow),
      time: "09:00",
      topics: "Rovnice",
      notes: "",
      difficulty: 3,
      targetPercent: 90,
      plannedMinutes: 240,
      status: "preparing",
      initialReadiness: 40,
    },
  });
  expect(future.status()).toBe(201);
  await page.reload();
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Nadchádzajúce testy" })
      .locator(".stat-value"),
  ).toHaveText("1");
  await expect(
    page.getByRole("link", { name: "TEST Ďalší test", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Otvoriť menu" }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Učenie", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Učenie", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/grades");
  await page
    .getByRole("button", { name: "Upraviť: TEST prvá známka", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: /^Známka/ })
    .fill("1");
  await saveDialog(page);
  await expect(page.locator(".stat-value").first()).toHaveText("1");
  await page.goto(testUrl);
  await page
    .getByRole("button", {
      name: "Upraviť: TEST Lineárne rovnice",
      exact: true,
    })
    .click();
  await page.getByLabel("Názov testu").fill("TEST Upravené rovnice");
  await saveDialog(page);
  await expect(
    page.getByRole("heading", { name: "TEST Upravené rovnice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Upraviť: TEST Precvičovanie rovníc",
      exact: true,
    })
    .click();
  await page.getByLabel("Dĺžka učenia").fill("150");
  await saveDialog(page);
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Už odštudované" })
      .locator(".stat-value"),
  ).toHaveText("2 h 30 min");
  const snapshot = (await (await request.get("/api/data")).json()) as Snapshot;
  const subjectRecord = snapshot.subjects.find((s) => s.name === subject)!;
  const result = snapshot.results.find(
    (r) =>
      snapshot.tests.find((t) => t.id === r.testId)?.subjectId ===
      subjectRecord.id,
  )!;
  expect(result.percentage).toBe(84);
  expect(result.actualStudyMinutes).toBe(120);
  const material = snapshot.materials.find(
    (m) => m.subjectId === subjectRecord.id,
  )!;
  const download = await request.get(`/api/materials/${material.id}`);
  expect(download.ok()).toBeTruthy();
  expect(await download.text()).toContain("Vyries rovnicu");
  await page.goto("/settings");
  await page
    .getByRole("button", { name: `Odstrániť: ${subject}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("všetky známky");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Odstrániť", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const after = (await (await request.get("/api/data")).json()) as Snapshot;
  expect(after.subjects.find((s) => s.id === subjectRecord.id)).toBeUndefined();
  expect(after.materials.find((m) => m.id === material.id)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("API rejects invalid scores, relationships and cross-site access", async ({
  request,
}) => {
  const blocked = await request.get("/api/data", {
    headers: { Origin: "https://example.com" },
  });
  expect(blocked.status()).toBe(403);
  const invalid = await request.post("/api/data/grades", {
    data: {
      subjectId: "invalid",
      value: 6,
      weight: 0,
      date: "2026-02-30",
      assessmentType: "TEST",
    },
  });
  expect(invalid.status()).toBe(400);
  const file = await request.post("/api/materials", {
    multipart: {
      subjectId: "invalid",
      file: {
        name: "test.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("not a supported file"),
      },
    },
  });
  expect(file.status()).toBe(400);
});
