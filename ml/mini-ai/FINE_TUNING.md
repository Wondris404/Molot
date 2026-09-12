# Fine-tuning decision for MOLOT 3.5

No fine-tuning was performed for 3.5. The current 30-case benchmark is too small
to justify training and the complete constrained pipeline already passes it. A
LoRA trained on these cases would mainly memorize the benchmark.

Fine-tuning can be reconsidered after MOLOT has at least 200 voluntarily confirmed,
local corrections covering every task and both Slovak forms (with and without
diacritics). Data must be deduplicated by normalized input and split by document or
intent family, so near-paraphrases cannot enter both train and validation sets.
The untouched failure corpus remains the release gate.

If justified later, train a small LoRA against the exact Qwen3 0.6B base revision,
compare it with prompt-only 3.5 on held-out data, and activate it only when field
accuracy improves without reducing JSON validity or a major task category. Export
and checksum a separate adapter/model artifact. Never train automatically from a
single confirmation, and never send feedback outside the local computer.
