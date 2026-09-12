import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
delete process.env.MOLOT_DATA_DIR;
process.env.MOLOT_DATA_SUBDIR = `test-documents-${randomUUID()}`;

test(
  "local TXT, PDF, image OCR and scanned PDF extraction",
  { timeout: 210000 },
  async () => {
    const { dataDirectory, runtimeDirectory } = await import("../lib/paths");
    const { saveEntity } = await import("../lib/db");
    const { saveTeacherEntity, teacherSnapshot } =
      await import("../lib/teacher-db");
    const { uploadTeacherFile, parseTeacherFile } =
      await import("../lib/teacher-files");
    mkdirSync(dataDirectory, { recursive: true });
    const generated = spawnSync(
      path.join(runtimeDirectory, "python/python.exe"),
      [
        "-I",
        "-c",
        `
import pymupdf, sys
from pathlib import Path
root = Path(sys.argv[1])
doc = pymupdf.open()
page = doc.new_page(width=650, height=300)
page.insert_text((35,80), "1. Explain photosynthesis.", fontsize=26)
page.insert_text((35,140), "2. Draw a plant cell.", fontsize=26)
doc.save(root / "TEST-text.pdf")
png = page.get_pixmap(dpi=150).tobytes("png")
(root / "TEST-image.png").write_bytes(png)
scan = pymupdf.open()
scan.new_page(width=650,height=300).insert_image(pymupdf.Rect(0,0,650,300),stream=png)
scan.save(root / "TEST-scan.pdf")
`,
        dataDirectory,
      ],
      { encoding: "utf8", timeout: 30000, windowsHide: true },
    );
    assert.equal(generated.status, 0, "fixture generation must succeed");
    const subjectId = saveEntity("subjects", {
      name: "TEST Documents",
      color: "#88aa55",
    });
    const documentId = saveTeacherEntity("documents", {
      subjectId,
      kind: "test",
      title: "TEST extraction",
    });
    for (const filename of [
      "TEST-notes.txt",
      "TEST-text.pdf",
      "TEST-image.png",
      "TEST-scan.pdf",
    ]) {
      const content = filename.endsWith(".txt")
        ? Buffer.from("1. Explain photosynthesis.")
        : readFileSync(path.join(dataDirectory, filename));
      const form = new FormData();
      form.set("file", new File([content], filename));
      await uploadTeacherFile(
        new Request("http://127.0.0.1/api/teacher-files/test", {
          method: "POST",
          body: form,
        }),
        documentId,
      );
      const result = await parseTeacherFile(documentId);
      assert.match(result.text.toLowerCase(), /photosynthesis/, filename);
      assert.ok(
        ["text", "ocr_review", "ocr_low_quality"].includes(result.status),
        filename,
      );
      assert.equal(
        teacherSnapshot().questions.length,
        0,
        "extraction needs manual question approval",
      );
    }
  },
);
