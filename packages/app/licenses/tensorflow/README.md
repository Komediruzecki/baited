# TensorFlow.js 4.22.0 notices

Verified on 2026-10-28. These files supplement the npm dependency inventory because the installed TensorFlow packages do not include standalone license files.

- `LICENSE-Apache-2.0.txt` is the complete root license from [TensorFlow.js release tfjs-v4.22.0](https://github.com/tensorflow/tfjs/tree/e5d5e9371ed1fd0a4df6d7cd0b947d2a820cefd7), commit `e5d5e9371ed1fd0a4df6d7cd0b947d2a820cefd7`. It covers the Apache-2.0 TensorFlow packages at version 4.22.0: tfjs, tfjs-core, tfjs-converter, tfjs-data, tfjs-backend-cpu, tfjs-backend-webgl and tfjs-backend-wasm.
- `tfjs-layers-LICENSE.txt` preserves the complete upstream **MIT and Apache-2.0** license, including the François Chollet, Google, Microsoft and contributor notices. The Layers package is not Apache-only.
- `DISTRIBUTION-NOTICES.txt` preserves the verbatim license/copyright comment blocks found in the installed non-minified top-level distribution JavaScript files. It includes embedded Microsoft tslib and seedrandom notices. Repeated identical blocks are grouped with their source filenames.
- `wasm/` preserves the full licenses for dependencies pinned in the release's `WORKSPACE`: XNNPACK, FP16, FXdiv, pthreadpool, clog, cpuinfo, psimd and the Emscripten 3.1.28 toolchain license. `UPSTREAM-WORKSPACE.txt` records the exact revisions. These are upstream build-dependency notices; this collection does not claim a symbol-level inventory of every runtime object included in the published WASM binaries. Emscripten's own license also identifies licenses for subcomponents.

Exact source URLs, SHA-256 hashes and installed distribution input hashes are recorded in [`../packaging-notice-provenance.json`](../packaging-notice-provenance.json). Upstream text has not been rewritten. No TensorFlow code or model was changed by collecting these notices.
