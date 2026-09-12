# MOLOT Mini AI 3.5

Mini AI is an optional local language layer. MOLOT works without it. It never
calculates grades, percentages, dates, statistics, recommendations or predictions;
normal TypeScript and Python code continue to own those operations.

## Selected model

- Qwen3 0.6B Q8_0 GGUF, official Qwen repository
- 639,446,688 bytes (about 610 MiB / advertised 639 MB)
- Apache-2.0 model license
- SHA-256 `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`
- llama.cpp server build 10887 (`4ea6d1bb6`), local loopback only

The model is downloaded only after the user chooses **Stiahnuť** in settings. It
is not bundled in the installer. Once downloaded and verified, inference is offline.

## Architecture

`router.ts` exposes narrow, versioned tasks for input classification, school and
goal extraction, topic extraction, teacher question classification, semantic
question comparison, question-to-topic mapping and plain-language explanations.
Each task has a Zod schema and a llama.cpp JSON schema. Context contains only the
small relevant candidate list, never the whole database. Documents are chunked.

The runtime is reused between requests and stops after five idle minutes. Cache
keys include model, prompt, schema, task, input and context. Invalid output returns
`null`; the existing deterministic/manual flow continues. Suggested Smart Add data
must still be confirmed. Confirmed corrections are stored locally as feedback and
are never used for automatic training.

Teacher extraction first uses deterministic parsing and candidate reduction. The
model reviews at most 16 ambiguous questions and can only select supplied topics.
Low-confidence topic guesses are discarded.

## Measured benchmark

Run `npm run test:mini-ai`. The report is written to `results/3.5.0.json`; raw-model
failures and corrected pipeline outputs are retained in `failures/3.5.0.json`.
All inputs are synthetic TEST data.

Final 30-case / 10-category run on 2026-09-12:

- old universal prompt: 0% field accuracy and 0% JSON validity in this server test
- task-specific raw model: 60.0% field accuracy, 100% JSON/schema validity
- complete MOLOT 3.5 pipeline: 100.0% field accuracy, 30/30 exact cases
- model load: 2.21 s
- mean 3.5 inference latency: 2.99 s per request
- measured peak llama-server working set: 1,267,376,128 bytes (about 1.18 GiB)
- process CPU time for the full 60-request comparison: 1,179.67 s across threads

This is a small fixed synthetic benchmark, not proof of general intelligence or
real-world accuracy. The raw 60% score is why deterministic validation and user
confirmation remain mandatory.
