# Speech comparison: third-party notices

Baited's optional Speech bench serves prepared Whisper model and runtime files from the same website. These files support the local microphone and WAV comparison. They do not replace Studio's speech provider or submit game commands.

## Software

- **Transformers.js 4.3.1**, Hugging Face: [Apache License 2.0](/licenses/speech-bench/LICENSE-Transformers-Apache-2.0.txt). Its published browser bundle includes ONNX Runtime code; the [upstream bundled notice](/licenses/speech-bench/TRANSFORMERS-BUNDLED-NOTICE.txt) is retained here because the published minified bundle removes legal comments.
- **ONNX Runtime Web 1.31.0-dev.20260914-8d85527a0**, Microsoft Corporation: [MIT License](/licenses/speech-bench/LICENSE-ONNX-Runtime-MIT.txt) and the complete [upstream third-party notices](/licenses/speech-bench/THIRD-PARTY-NOTICES-ONNX-Runtime.txt), from source commit `8d85527a010e294a26b274749f74294b2a32cec5`. That notice file covers upstream builds generally; retaining it does not mean every optional backend listed there is included in Baited's WASM build.
- **@huggingface/jinja 0.5.10**, Copyright (c) 2023 Hugging Face: [MIT License](/licenses/speech-bench/LICENSE-Jinja-MIT.txt). **@huggingface/tokenizers 0.2.0**: [Apache License 2.0](/licenses/speech-bench/LICENSE-Tokenizers-Apache-2.0.txt). These dependency versions are recorded in the Transformers.js 4.3.1 source lockfile.

## Model

The prepared model is **Xenova/whisper-tiny**, revision `5332fcc35e32a33b86612b9a57a89be7906102b1`, using its quantized ONNX encoder and merged decoder. The [pinned model card](https://huggingface.co/Xenova/whisper-tiny/blob/5332fcc35e32a33b86612b9a57a89be7906102b1/README.md) identifies `openai/whisper-tiny` as its base model and declares Apache-2.0. A complete [Apache License 2.0 text](/licenses/speech-bench/LICENSE-Transformers-Apache-2.0.txt) is provided with this distribution.

The original Whisper project is Copyright (c) 2022 OpenAI and is distributed under the [MIT License](/licenses/speech-bench/LICENSE-Whisper-MIT.txt). That original copyright and permission notice is also preserved here.

Baited's capture and comparison adapters are separate application code. The prepared upstream runtime and model bytes are retained; large files may be split for hosting and reassembled with checksum verification. No model retraining or weight changes are made by that packaging step.

[Provenance](/licenses/speech-bench/PROVENANCE.json) records the exact upstream license URLs, pinned revisions, file sizes and SHA-256 checksums. The original asset lock records the runtime and model checksums. This distribution notice describes the hosted comparison; the earlier developer-bench notice retained with the original preparation inputs describes an older delivery scope.
