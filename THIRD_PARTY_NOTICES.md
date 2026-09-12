# Third-party notices

MOLOT source code is MIT licensed. Third-party components remain under their own
licenses. The release includes notices and licenses required by their distributions.

- Next.js, React, Tailwind CSS, Recharts and Tauri: their respective open-source licenses.
- llama.cpp server build 10887, commit `4ea6d1bb6`: MIT; its CPU runtime is bundled.
- Qwen3-0.6B-GGUF Q8_0: Apache-2.0; the 639,446,688-byte model is downloaded separately by the user and is not part of the installer.
- Tesseract data/runtime and pypdfium2 must retain their upstream notices in a future
  packaged distribution.

Before changing a bundled model or runtime, its exact version, license and required
notices must be checked again and included with the release.
