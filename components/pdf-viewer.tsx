"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Render one PDF page at a time using local PDF.js assets. No OCR or remote services. */
export function PdfViewer({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(500);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(150, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `/api/pdf-assets/build/pdf.worker.min.mjs?v=${pdfjs.version}`;
        task = pdfjs.getDocument({
          url,
          enableXfa: false,
          cMapUrl: "/api/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/api/pdf-assets/standard_fonts/",
          wasmUrl: "/api/pdf-assets/wasm/",
        });
        const pdf = await task.promise;
        if (!cancelled) setDocument(pdf);
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error && error.name === "PasswordException"
              ? "Toto PDF je chránené heslom. Otvor ho vo svojom PDF prehliadači."
              : "PDF sa nepodarilo vykresliť. Súbor môže byť poškodený; môžeš ho stiahnuť a otvoriť samostatne.",
          );
          setState("error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    const pdf = document;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    const surface = canvas.current;
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({
          scale: width / page.getViewport({ scale: 1 }).width,
        });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        surface.width = Math.floor(viewport.width * pixelRatio);
        surface.height = Math.floor(viewport.height * pixelRatio);
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas: surface,
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;
        const content = await page.getTextContent();
        if (!cancelled) {
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
          setState("ready");
        }
      } catch (error) {
        if (
          !cancelled &&
          !(
            error instanceof Error &&
            error.name === "RenderingCancelledException"
          )
        ) {
          setError(
            "Túto stranu sa nepodarilo zobraziť. Stiahni súbor a otvor ho samostatne.",
          );
          setState("error");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, width]);
  return (
    <div ref={container} className="pdf-viewer">
      {document && (
        <div className="inline spaced mb-3">
          <button
            className="icon-button"
            aria-label="Predošlá strana PDF"
            disabled={pageNumber <= 1 || state === "loading"}
            onClick={() => {
              setState("loading");
              setPageNumber((value) => value - 1);
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="small muted">
            Strana {pageNumber} z {document.numPages}
          </span>
          <button
            className="icon-button"
            aria-label="Ďalšia strana PDF"
            disabled={pageNumber >= document.numPages || state === "loading"}
            onClick={() => {
              setState("loading");
              setPageNumber((value) => value + 1);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {state === "loading" && (
        <p className="small muted mb-3" role="status">
          Načítavam PDF lokálne…
        </p>
      )}
      {state === "error" && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="pdf-scroll">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`PDF – strana ${pageNumber}`}
          data-rendered={state === "ready"}
        />
      </div>
      {state === "ready" && (
        <details className="small muted mt-3">
          <summary>Text strany</summary>
          <p className="note-text mt-2">
            {text ||
              "Táto strana nemá textovú vrstvu. OCR zatiaľ nie je pripojené."}
          </p>
        </details>
      )}
    </div>
  );
}
