# MOLOT project status

**Identity:** MOLOT — Made by WONDRIS dev · open-source · local-first.

**Working release:** 3.5.0 — AI Improvement Version. Product name stays **MOLOT**.
The stable 0.3.0 installer is preserved under `release/0.3.0/`; future release
builds write only to their own version directory.

## DONE

- Windows Tauri/NSIS installer, local SQLite, safe migrations, uploads, backup/restore.
- School modules: subjects, grades, tests, study, readiness, results, errors and charts.
- Student baseline plus local scikit-learn training and guarded model activation.
- Teacher profiles, historical documents, local PDF/TXT/OCR extraction, patterns and predictions.
- Local profile/onboarding, shared goals/progress/milestones and universal confirmed input.
- MOLOT 3.5 task-specific Mini AI router with Zod + llama.cpp JSON schemas.
- Persistent loopback runtime with five-minute idle shutdown and fail-safe fallback.
- Deterministic numeric/date/unit layer; the LLM handles language and ambiguous meaning only.
- Teacher candidate reduction, chunked notes and optional AI review of ambiguous questions.
- Versioned local cache and confirmed/corrected local feedback; no automatic training.
- 30-case, 10-category synthetic benchmark with raw outputs, resource metrics and failure corpus.
- Final benchmark: raw model 60.0% fields; full 3.5 pipeline 100.0%, 30/30 exact,
  100% JSON/schema validity; 2.21 s load, 2.99 s mean request, about 1.18 GiB peak RAM.
- Fine-tuning investigated and deliberately deferred until a sufficiently large held-out dataset exists.
- Stable 0.3.0 release preserved: 330,439,713 bytes, SHA-256
  `cf59caffcadad351b6d103e786c56d8f3a2591f5dec01d633a6e82fbdbf8a91a`.

## PARTIAL

- The 3.5 source and AI benchmark are complete; the separate 3.5 NSIS installer still
  needs its final installer smoke test before release is marked finished.
- Public repository `Wondris404/Molot` is available. The first sanitized 3.5 source
  snapshot and versioned installer releases are being published. The original 0.3.0
  source snapshot was not preserved, so it must not be reconstructed from 3.5 code.

## NEXT

1. Publish sanitized source and distinct 0.3.0/3.5.0 release artifacts.
2. Smoke-test `release/3.5.0/Molot-Setup-3.5.0.exe`.
3. Finish the remaining 3.5 Smart Add and semantic teacher-analysis regressions.
