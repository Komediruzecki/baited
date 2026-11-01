// Same-origin, dedicated inference worker. No microphone, game state, or target words here.

let transcriber;
let stream;
let generation = 0;
let samples = 0;
const send = (message) => self.postMessage(message);
let stage = 'bootstrap';
function entering(next) { stage = next; send({ type: 'stage', stage }); }
entering('bootstrap');

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      if (!transcriber) {
        // Import inside the handler so module/SDK failures become useful errors, not a silent worker crash.
        // Only load the speech modules; the aggregate index also imports unrelated voice-generation modules.
        entering('importing-sdk');
        const [{ Transcriber }, { ModelArch }, { AssetDownloader }, { loadMoonshineModule }] = await Promise.all([
          import('/moonshine/runtime-0.1.5-csp1/transcriber.js'),
          import('/moonshine/runtime-0.1.5-csp1/enums.js'),
          import('/moonshine/runtime-0.1.5-csp1/asset-downloader.js'),
          import('/moonshine/runtime-0.1.5-csp1/module.js'),
        ]);
        entering('loading-runtime');
        const module = await loadMoonshineModule();
        const manifest = JSON.parse(module.sttDependencies('en', String(ModelArch.TinyStreaming), false));
        const group = manifest.groups[0];
        // 0.1.5's catalog omits this optional file even with word_timestamps=true.
        // Keep the attention decoder on the SAME pinned model revision as the runtime.
        if (!group.files.some((f) => f.name === 'decoder_kv_with_attention.ort')) {
          group.files.push({ name: 'decoder_kv_with_attention.ort',
            url: `${group.base_url}/decoder_kv_with_attention.ort`, size: 32515016 });
        }
        const downloader = new AssetDownloader({ onProgress: (loaded, total) => send({ type: 'progress', loaded, total }) });
        entering('downloading-model');
        const files = await downloader.downloadManifest(JSON.stringify(manifest));
        entering('initializing-model');
        transcriber = await Transcriber.load({ files, module, modelArch: ModelArch.TinyStreaming,
          options: { word_timestamps: 'true', decode_incomplete_lines: 'false', log_output_text: 'false' } });
        send({ type: 'model', revision: group.base_url, bytes: group.files.reduce((n, f) => n + f.size, 0) });
        entering('ready');
      }
    } else if (type === 'start') {
      entering('starting');
      stream?.close();
      generation = data.generation;
      samples = 0;
      stream = transcriber.createStream({ updateInterval: 0.5 });
      const own = generation;
      stream.addListener({ onLineCompleted: ({ line }) => send({ type: 'line', generation: own, line, audioSeconds: samples / 16000 }) });
      stream.start();
      entering('transcribing');
    } else if (type === 'audio') {
      if (!stream || data.generation !== generation) return;
      const audio = new Float32Array(data.buffer);
      const started = performance.now();
      stream.addAudio(audio, 16000);
      samples += audio.length;
      stream.transcribe();
      send({ type: 'pass', generation, samples: audio.length, ms: performance.now() - started });
    } else if (type === 'finish') {
      entering('finishing');
      if (stream && data.generation === generation) {
        const started = performance.now();
        stream.stop();
        send({ type: 'pass', generation, samples: 0, ms: performance.now() - started });
        stream.close();
        stream = undefined;
      }
    } else if (type === 'reset') {
      stream?.close();
      stream = undefined;
      generation = data.generation;
    }
    if (id) send({ type: 'reply', id });
  } catch (error) {
    send({ type: 'error', id, generation, stage, message: error instanceof Error ? error.message : 'Moonshine could not transcribe this audio.' });
  }
};
