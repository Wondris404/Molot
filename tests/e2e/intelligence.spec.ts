import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => { await request.patch("/api/global/profile", { data: { name: "TEST User", modules: ["school"], mainGoal: "", onboardingComplete: true } }); });

test("teacher UI, reviewed questions, prediction feedback and refresh", async ({
  page,
  request,
}) => {
  const subject = await (
    await request.post("/api/data/subjects", {
      data: { name: `TEST Teacher ${Date.now()}`, color: "#88aa55" },
    })
  ).json();
  await page.goto("/teachers");
  await page
    .getByRole("button", { name: "Pridať učiteľa", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Meno učiteľa").fill("TEST Teacher");
  await dialog
    .getByRole("combobox", { name: "Predmet", exact: true })
    .selectOption(subject.id);
  await dialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Otvoriť profil" }).last().click();
  await expect(page).toHaveURL(/\/teachers\/[a-f0-9-]+$/);
  const profileUrl = page.url();
  await page
    .getByRole("button", { name: "Pridať historický test", exact: true })
    .click();
  await dialog.getByLabel("Názov dokumentu").fill("TEST History");
  await dialog.getByLabel("Približný dátum (voliteľný)").fill("2025-05-01");
  await dialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /^TEST History/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "TEST.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("1. Explain photosynthesis. (4 points)"),
  });
  await page
    .getByRole("button", { name: "Extrahovať text / lokálne OCR" })
    .click();
  const text = page.getByLabel(
    "Text dokumentu (môžeš ho opraviť alebo vložiť ručne)",
  );
  await expect(text).toHaveValue(/photosynthesis/);
  await text.fill("1. Vysvetli fotosyntézu. (4 body)");
  await page.getByRole("button", { name: "Uložiť opravený text" }).click();
  await page.getByRole("button", { name: "Navrhnúť z textu" }).click();
  await dialog.getByLabel("Skontroloval som návrhy").check();
  await dialog
    .getByRole("button", { name: "Uložiť skontrolované návrhy" })
    .click();
  await expect(dialog).not.toBeVisible();
  const snapshot = await (await request.get("/api/intelligence")).json();
  const teacher = snapshot.teachers.find(
    (t: { subjectId: string }) => t.subjectId === subject.id,
  );
  const question = snapshot.questions.find((q: { text: string }) =>
    q.text.includes("fotosyntézu"),
  );
  await request.post("/api/intelligence", {
    data: {
      operation: "save",
      entity: "questions",
      id: question.id,
      values: { ...question, topic: "Fotosyntéza" },
    },
  });
  const exam = await (
    await request.post("/api/data/tests", {
      data: {
        subjectId: subject.id,
        title: "TEST Prediction",
        date: "2026-10-01",
        difficulty: 3,
        targetPercent: 85,
        plannedMinutes: 120,
        status: "planned",
        topics: "Fotosyntéza",
      },
    })
  ).json();
  await page.goto(`/tests/${exam.id}`);
  await page
    .getByRole("combobox", { name: "Učiteľ", exact: true })
    .selectOption(teacher.id);
  await page.getByRole("button", { name: "Uložiť podklady predikcie" }).click();
  await expect(
    page.getByText("1 testov · istota Nízka.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Uložiť túto predikciu pred testom" })
    .click();
  await expect(
    page.getByText("Uložená predikcia:", { exact: false }),
  ).toBeVisible();
  await request.post("/api/data/results", {
    data: {
      testId: exam.id,
      earnedPoints: 42,
      maxPoints: 50,
      percentage: 0,
      grade: 2,
      actualStudyMinutes: 120,
      readinessBefore: 60,
      perceivedDifficulty: 3,
    },
  });
  await page.reload();
  await page.getByLabel("Skutočné témy (čiarkou)").fill("Fotosyntéza");
  await page.getByLabel("Diagram", { exact: true }).check();
  await page
    .getByRole("button", {
      name: "Uložiť skutočný obsah a vyhodnotiť predikciu",
    })
    .click();
  await expect(page.getByText("Precision:", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Skutočné témy (čiarkou)")).toHaveValue(
    "Fotosyntéza",
  );
  await expect(page.getByLabel("Diagram", { exact: true })).toBeChecked();
  await page.goto(profileUrl);
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  const graphCount = await page.locator(".recharts-wrapper").count();
  expect(graphCount).toBeGreaterThanOrEqual(5);
  await request.delete("/api/data/subjects", { data: { id: subject.id } });
});
