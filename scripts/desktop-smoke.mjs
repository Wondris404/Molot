import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// WebView2 testing follows https://playwright.dev/docs/webview2 .
// The debug port and data override exist only in this isolated test process.
const dataDirectory = path.resolve(
  process.env.MOLOT_SMOKE_DATA_DIR || path.join("data", `test-desktop-${randomUUID()}`),
);
const executable = path.resolve(
  process.env.MOLOT_SMOKE_EXE || "desktop/release/Molot.exe",
);
mkdirSync(dataDirectory, { recursive: true });
const environment = {
  ...process.env,
  MOLOT_DATA_DIR: dataDirectory,
  WEBVIEW2_USER_DATA_FOLDER: path.join(dataDirectory, "cache/webview"),
};
delete environment.MOLOT_DESKTOP_RESOURCES;
delete environment.MOLOT_RUNTIME_DIR;
delete environment.MOLOT_ENGINE_SCRIPT;
const listener = createServer().listen(0, "127.0.0.1");
await once(listener, "listening");
const debugPort = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
environment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${debugPort} --remote-debugging-address=127.0.0.1`;
let child;
let browser;
async function launch() {
  child = spawn(executable, [], {
    env: environment,
    windowsHide: true,
    stdio: "ignore",
  });
  child.on("error", (error) => console.error(error.message));
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 45000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  await expect
    .poll(() => context.pages().length, { timeout: 15000 })
    .toBeGreaterThan(0);
  const page = context.pages()[0];
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30000 });
  const onboarding = page.getByRole("dialog", { name: "Vitaj v MOLOTe" });
  const schoolDashboard = page.getByRole("heading", {
    name: "Tvoj školský prehľad.",
    exact: true,
  });
  await expect
    .poll(
      async () =>
        (await onboarding.isVisible()) || (await schoolDashboard.isVisible()),
      { timeout: 30000 },
    )
    .toBe(true);
  if (await onboarding.isVisible()) {
    await onboarding.getByLabel("Ako ťa máme oslovovať?").fill("TEST Desktop");
    await onboarding.getByRole("button", { name: "Začať" }).click();
    await expect(onboarding).not.toBeVisible();
  }
  await expect(schoolDashboard).toBeVisible({ timeout: 30000 });
  return page;
}
async function stop() {
  if (browser) {
    await browser.close();
    browser = undefined;
  }
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await expect
    .poll(
      async () => {
        try {
          await fetch(`http://127.0.0.1:${debugPort}/json/version`);
          return false;
        } catch {
          return true;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
}
async function json(url, data, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}
try {
  let page = await launch();
  const origin = new URL(page.url()).origin;
  const { id: subjectId } = await json(`${origin}/api/data/subjects`, {
    name: "TEST Desktop Persistence",
    color: "#88aa55",
  });
  await json(`${origin}/api/data/grades`, {
    subjectId,
    value: 2,
    weight: 3,
    date: "2026-09-10",
    assessmentType: "TEST",
  });
  const { id: documentId } = await json(`${origin}/api/intelligence`, {
    operation: "save",
    entity: "documents",
    values: { subjectId, title: "TEST packaged parser", kind: "test" },
  });
  const form = new FormData();
  form.set("file", new File(["1. Explain photosynthesis."], "TEST.txt"));
  assert.ok(
    (
      await fetch(`${origin}/api/teacher-files/${documentId}`, {
        method: "POST",
        body: form,
      })
    ).ok,
  );
  const parsed = await json(
    `${origin}/api/teacher-files/${documentId}`,
    {},
    "PATCH",
  );
  assert.match(parsed.text, /photosynthesis/);
  const fixture = spawnSync(
    path.resolve("desktop/release/resources/python/python.exe"),
    [
      "-I",
      "-c",
      `
import pymupdf, sys
from pathlib import Path
root = Path(sys.argv[1])
doc = pymupdf.open()
page = doc.new_page(width=650, height=200)
page.insert_text((35,80), "Explain photosynthesis.", fontsize=28)
doc.save(root / "TEST.pdf")
page.get_pixmap(dpi=150).save(root / "TEST.png")
`,
      dataDirectory,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  assert.equal(fixture.status, 0, "bundled PyMuPDF");
  for (const filename of ["TEST.pdf", "TEST.png"]) {
    const upload = new FormData();
    upload.set(
      "file",
      new File([readFileSync(path.join(dataDirectory, filename))], filename),
    );
    assert.ok(
      (
        await fetch(`${origin}/api/teacher-files/${documentId}`, {
          method: "POST",
          body: upload,
        })
      ).ok,
    );
    const extraction = await json(
      `${origin}/api/teacher-files/${documentId}`,
      {},
      "PATCH",
    );
    assert.match(extraction.text.toLowerCase(), /photosynthesis/, filename);
  }
  const backupResponse = await fetch(`${origin}/api/backup`);
  assert.ok(backupResponse.ok, "packaged backup export");
  const backup = await backupResponse.arrayBuffer();
  await json(`${origin}/api/data/subjects`, {
    name: "TEST removed by restore",
    color: "#ffffff",
  });
  const unconfirmedRestore = await fetch(`${origin}/api/backup`, {
    method: "POST",
    body: backup,
  });
  assert.equal(unconfirmedRestore.status, 400, "restore requires confirmation");
  assert.equal((await (await fetch(`${origin}/api/data`)).json()).subjects.length, 2);
  const restoreResponse = await fetch(`${origin}/api/backup`, {
    method: "POST",
    headers: { "x-molot-confirm-restore": "yes" },
    body: backup,
  });
  assert.ok(restoreResponse.ok, JSON.stringify(await restoreResponse.json()));
  assert.equal((await (await fetch(`${origin}/api/data`)).json()).subjects.length, 1);
  const restoredFile = await fetch(`${origin}/api/teacher-files/${documentId}`);
  assert.ok(restoredFile.ok, "restored teacher file remains accessible");
  assert.ok((await restoredFile.arrayBuffer()).byteLength > 0);
  await page.goto(`${origin}/grades`);
  await expect(
    page.getByText("TEST Desktop Persistence", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(dataDirectory, "desktop.png"),
    fullPage: true,
  });
  await stop();
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${origin}/api/data`);
          return false;
        } catch {
          return true;
        }
      },
      { timeout: 10000 },
    )
    .toBe(true);
  page = await launch();
  const secondOrigin = new URL(page.url()).origin;
  const snapshot = await (await fetch(`${secondOrigin}/api/data`)).json();
  assert.equal(snapshot.subjects[0].id, subjectId);
  assert.equal(snapshot.grades[0].value, 2);
  const intelligence = await (
    await fetch(`${secondOrigin}/api/intelligence`)
  ).json();
  assert.equal(path.resolve(intelligence.paths.data), dataDirectory);
  assert.match(intelligence.documents[0].text.toLowerCase(), /photosynthesis/);
  writeFileSync(
    path.join(dataDirectory, "result.json"),
    JSON.stringify(
      {
        passed: true,
        dataDirectory,
        checks: [
          "native window",
          "bundled server",
          "bundled Python",
          "school records",
          "teacher document",
          "backup export and confirmed restore",
          "process cleanup",
          "restart persistence",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Desktop smoke passed. Evidence: ${dataDirectory}`);
} finally {
  await stop();
}
