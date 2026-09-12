# MOLOT project status

**Identity:** MOLOT — originally created by Ondrej Lučivjanský-Wondris404 · open-source · local-first.

**Permanent release rule:** every MOLOT version must retain the standard MIT License
with `Copyright (c) 2026 Ondrej Lučivjanský-Wondris404` and use the same author name
in README, application credits, npm/Cargo metadata, and installer metadata.

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
- Slovak Smart Add regression cases preserve subject aliases, points, grade, computed
  percentage, relative weekday, study duration, running distance, and clock time.
- Optional semantic comparison now reviews low-overlap teacher questions and can carry
  a confirmed historical topic into a newly extracted question before user confirmation.
- Final 3.5 checks: 37/37 unit/integration, 10/10 desktop/mobile E2E, lint, Next build,
  release privacy audit, and installed-app smoke test all pass.
- Final NSIS installer: `release/3.5.0/Molot-Setup-3.5.0.exe`, SHA-256
  `f777e09a6501321ed64975a4bab32849ad26909486a87290d6a6e786249d8367`.

## PARTIAL

- Public repository `Wondris404/Molot` contains sanitized source and version tags.
  Binary installer assets still require a signed-in GitHub web session to create the
  Releases. The original 0.3.0 source snapshot was not preserved and is not fabricated.

## NEXT

1. Attach the preserved 0.3.0 and final 3.5.0 installers to their GitHub Releases after login.
2. Start the next requested MOLOT version only from the final tagged 3.5 source.
