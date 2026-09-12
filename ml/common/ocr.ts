import path from "node:path";
import { mkdir } from "node:fs/promises";
import { createWorker } from "tesseract.js";
import { dataDirectory, runtimeDirectory } from "../../lib/paths";
import { logEvent } from "../../lib/logger";

/** Local language files only. One worker is reused for the bounded page batch. */
export async function recognizePages(pages: Buffer[], documentId: string) {
  await mkdir(path.join(dataDirectory, "cache/ocr"), { recursive: true });
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    worker = await createWorker("slk+eng", 1, {
      langPath: path.join(runtimeDirectory, "tessdata"),
      gzip: false,
      cachePath: path.join(dataDirectory, "cache/ocr"),
      cacheMethod: "none",
      workerPath: path.join(
        process.cwd(),
        "node_modules/tesseract.js/src/worker-script/node/index.js",
      ),
      errorHandler: () => logEvent("ocr_error", { documentId }),
    });
    if (expired) {
      await worker.terminate();
      throw new Error("OCR prekročilo časový limit.");
    }
    const texts: string[] = [];
    let confidence = 100;
    for (const page of pages) {
      const { data } = await worker.recognize(page);
      texts.push(data.text);
      confidence = Math.min(confidence, data.confidence);
    }
    return {
      text: texts.join("\n\n").slice(0, 100000),
      status: confidence >= 70 ? "ocr_review" : "ocr_low_quality",
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(
            new Error("OCR prekročilo časový limit. Text môžeš doplniť ručne."),
          );
        }, 120000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}
