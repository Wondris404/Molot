import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../lib/types";

test.beforeEach(async ({ request }) => { await request.patch("/api/global/profile", { data: { name: "TEST User", modules: ["school"], mainGoal: "", onboardingComplete: true } }); });

function samplePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content = "BT /F1 18 Tf 25 250 Td (TEST Molot worksheet) Tj ET";
  objects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("local material types, preview, rename, deletion and signature validation", async ({
  page,
  request,
}, testInfo) => {
  const created = await request.post("/api/data/subjects", {
    data: { name: `TEST ${testInfo.project.name} Upload`, color: "#a1c4b4" },
  });
  const { id: subjectId } = (await created.json()) as { id: string };
  try {
    await page.goto("/errors");
    await expect(
      page.getByRole("heading", { name: "Analýza chýb", exact: true }),
    ).toBeVisible();
    const png = await page.screenshot({ type: "png" });
    const jpeg = await page.screenshot({ type: "jpeg" });
    const files = [
      { name: "TEST.pdf", mimeType: "application/pdf", buffer: samplePdf() },
      { name: "TEST.png", mimeType: "image/png", buffer: png },
      { name: "TEST.jpg", mimeType: "image/jpeg", buffer: jpeg },
      { name: "TEST.jpeg", mimeType: "image/jpeg", buffer: jpeg },
    ];
    const ids: string[] = [];
    for (const file of files) {
      const response = await request.post("/api/materials", {
        multipart: { subjectId, file },
      });
      expect(response.status()).toBe(201);
      const { id } = (await response.json()) as { id: string };
      ids.push(id);
      const downloaded = await request.get(`/api/materials/${id}?download=1`);
      expect(downloaded.headers()["content-type"]).toBe(file.mimeType);
      expect(await downloaded.body()).toEqual(file.buffer);
    }
    await page.reload();
    await page
      .getByRole("button", { name: "Zobraziť: TEST.png", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Zavrieť", exact: true }).click();
    await page
      .getByRole("button", { name: "Zobraziť: TEST.pdf", exact: true })
      .click();
    const canvas = page.getByRole("dialog").locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await expect(
      page.getByRole("dialog").getByText("Strana 1 z 1"),
    ).toBeVisible();
    await page.getByText("Text strany", { exact: true }).click();
    await expect(
      page.getByText("TEST Molot worksheet", { exact: true }),
    ).toBeVisible();
    expect(
      await canvas.evaluate((element) => {
        const surface = element as HTMLCanvasElement;
        const pixels = surface
          .getContext("2d")!
          .getImageData(0, 0, surface.width, surface.height).data;
        return pixels.some((value, index) => index % 4 !== 3 && value < 100);
      }),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath("pdf-preview.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Zavrieť", exact: true }).click();
    await page
      .getByRole("button", { name: "Premenovať: TEST.pdf", exact: true })
      .click();
    await page.getByLabel("Názov materiálu").fill("TEST renamed.pdf");
    await page
      .getByRole("button", { name: "Uložiť názov", exact: true })
      .click();
    await expect(
      page.getByText("TEST renamed.pdf", { exact: true }),
    ).toBeVisible();
    const invalid = await request.post("/api/materials", {
      multipart: {
        subjectId,
        file: {
          name: "wrong.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("not a pdf"),
        },
      },
    });
    expect(invalid.status()).toBe(400);
    for (const id of ids) {
      expect((await request.delete(`/api/materials/${id}`)).ok()).toBeTruthy();
      expect((await request.get(`/api/materials/${id}`)).status()).toBe(404);
    }
    const data = (await (await request.get("/api/data")).json()) as Snapshot;
    expect(
      data.materials.filter((m) => m.subjectId === subjectId),
    ).toHaveLength(0);
  } finally {
    await request.delete("/api/data/subjects", { data: { id: subjectId } });
  }
});
