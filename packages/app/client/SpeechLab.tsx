import { useEffect, useRef, useState } from 'react';
import { Moonshine, type MoonshineLine } from './moonshine';
import { ONNX_VERSION, TRANSFORMERS_VERSION, WHISPER_MAX_SECONDS, WHISPER_MODEL, WHISPER_REVISION, WhisperBench, type WhisperLanguage } from './speech-bench/whisper-client';
import { decodeBenchAudio, type BenchAudio } from './speech-bench/audio';
import { MicrophoneSample } from './speech-bench/mic-sample';

type Provider = 'moonshine' | 'whisper';
type Sample = { line: MoonshineLine; deliveredMs: number; lastWordLagMs: number | null };
type Result = { provider: Provider; language: string; transcript: string; report: Record<string, unknown> };
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
};

/** Explicit local speech comparison. Never connects a game session or submits a command. */
export function SpeechLab() {
  const [whisperAvailable, setWhisperAvailable] = useState(import.meta.env.DEV);
  const [recordingMic, setRecordingMic] = useState(false);
  const micSample = useRef<MicrophoneSample | null>(null);
  const [provider, setProvider] = useState<Provider>('moonshine'), [language, setLanguage] = useState<WhisperLanguage>('en');
  const [status, setStatus] = useState('Choose a model, then load it.'), [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false), [running, setRunning] = useState(false);
  const [file, setFile] = useState<File | null>(null), [label, setLabel] = useState('OBS state not recorded');
  const [lines, setLines] = useState<Sample[]>([]), [results, setResults] = useState<Result[]>([]);
  const moonshine = useRef<Moonshine | null>(null), whisper = useRef<WhisperBench | null>(null);
  const generation = useRef(0), active = useRef(false), started = useRef(0), samples = useRef<Sample[]>([]);
  const loadMs = useRef(0), decoded = useRef<{ file: File; audio: BenchAudio } | null>(null);
  const dispose = () => {
    generation.current++;
    active.current = false;
    micSample.current?.close(); micSample.current = null;
    moonshine.current?.close(); moonshine.current = null;
    whisper.current?.close(); whisper.current = null;
  };
  useEffect(() => () => { dispose(); decoded.current = null; }, []);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const abort = new AbortController();
    void fetch('/speech-bench-assets/availability.json', { signal: abort.signal, credentials: 'omit', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
        const available = await response.json();
        if (!abort.signal.aborted) setWhisperAvailable(available.available === true && available.model === WHISPER_MODEL && available.revision === WHISPER_REVISION);
      }).catch(() => {});
    return () => abort.abort();
  }, []);
  const stop = (message = 'Stopped. Load the model again to continue.') => {
    dispose(); setReady(false); setLoading(false); setRunning(false); setRecordingMic(false); setStatus(message);
  };
  const load = async () => {
    dispose();
    const current = generation.current;
    const valid = () => generation.current === current;
    setReady(false); setLoading(true); setLines([]);
    setStatus(provider === 'whisper' ? 'Loading Whisper Tiny from this site' : 'Loading Moonshine Tiny');
    const start = performance.now();
    try {
      if (provider === 'whisper') {
        if (!whisperAvailable) throw new Error('Whisper is not prepared on this host. Use Moonshine or open the local comparison.');
        const worker = new WhisperBench(() => new Worker(new URL('./speech-bench/whisper-worker.ts', import.meta.url), { type: 'module', name: 'baited-whisper-bench' }),
          (message) => { if (valid()) setStatus(message); });
        whisper.current = worker;
        await worker.load();
      } else {
        const worker = new Moonshine((line) => {
          if (!valid() || !active.current) return;
          const deliveredMs = performance.now() - started.current;
          const end = line.words.at(-1)?.end;
          samples.current.push({ line, deliveredMs, lastWordLagMs: end === undefined ? null : deliveredMs - end * 1000 });
          setLines([...samples.current]);
        }, (message) => { if (valid()) setStatus(message); },
        (message) => { if (valid()) stop(message); });
        moonshine.current = worker;
        await worker.load();
      }
      if (!valid()) return;
      loadMs.current = performance.now() - start;
      setReady(true); setStatus(`${provider === 'whisper' ? 'Whisper' : 'Moonshine'} Tiny ready`);
    } catch (error) {
      if (valid()) stop(error instanceof Error ? error.message : 'The model could not load.');
    } finally { if (valid()) setLoading(false); }
  };
  const run = async () => {
    if (!ready || !file || active.current) return;
    const current = generation.current;
    const valid = () => generation.current === current;
    const check = () => { if (!valid()) throw new Error('Comparison stopped.'); };
    active.current = true; samples.current = []; setLines([]); setRunning(true);
    try {
      setStatus('Reading local audio');
      if (decoded.current?.file !== file) {
        const audio = await decodeBenchAudio(file, provider === 'whisper' ? WHISPER_MAX_SECONDS : 300);
        check(); decoded.current = { file, audio };
      }
      const { pcm, fingerprint } = decoded.current.audio;
      check();
      if (provider === 'whisper' && pcm.length > 16000 * WHISPER_MAX_SECONDS) {
        throw new Error('Use a clip up to one minute for Whisper. Moonshine supports up to five minutes.');
      }
      const common = { at: new Date().toISOString(), label, file: file.name, fileBytes: file.size,
        audioSeconds: pcm.length / 16000, pcmFingerprint: fingerprint, sampleRate: 16000,
        loadMs: loadMs.current, hardwareConcurrency: navigator.hardwareConcurrency,
        userAgent: navigator.userAgent,
        crossOriginIsolated: globalThis.crossOriginIsolated,
        privacy: 'Local file only; no microphone, audio upload, game commands or scoring.',
      };
      let result: Result;
      if (provider === 'whisper') {
        const worker = whisper.current;
        if (!worker) throw new Error('Load Whisper first.');
        setStatus('Whisper is transcribing the local file. Stop will unload its worker.');
        const output = await worker.transcribe(pcm, language);
        check();
        result = { provider, language, transcript: output.text, report: {
          ...common, format: 'baited-whisper-file-benchmark-v1', package: `@huggingface/transformers@${TRANSFORMERS_VERSION}`,
          onnxRuntime: ONNX_VERSION, model: WHISPER_MODEL, revision: WHISPER_REVISION,
          dtype: 'q8', device: 'wasm', threads: 1, language, task: 'transcribe',
          cachePolicy: 'Model and binary fetches request cache: no-store; browser model and WASM caches are disabled. Runtime module imports use normal browser caching. All files are checksum-verified at build time; fetched files are also verified in the browser, while imported runtime modules rely on same-origin delivery.',
          inferenceMs: output.inferenceMs, processingToAudioRatio: output.inferenceMs / (pcm.length / 16),
          transcript: output.text,
          processingMetric: 'Whole-file transcription, 30-second chunks with 5-second stride. This is not streaming latency and cannot be compared with Moonshine final-line lag.',
          confidencePolicy: 'Raw model transcript. No calibrated confidence score or command/scoring decision is produced.',
        } };
      } else {
        const worker = moonshine.current;
        if (!worker) throw new Error('Load Moonshine first.');
        await worker.start(); check(); started.current = performance.now();
        const scheduling: number[] = [];
        for (let i = 0; i < pcm.length; i += 2048) {
          check();
          const end = Math.min(i + 2048, pcm.length), due = started.current + end / 16;
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
          check(); scheduling.push(performance.now() - due); worker.audio(pcm.subarray(i, end));
          setStatus(`Replaying ${Math.floor(end / 16000)} / ${Math.ceil(pcm.length / 16000)} seconds`);
        }
        await worker.finish(); check();
        const transcript = samples.current.map((sample) => sample.line.text).join(' ');
        result = { provider, language: 'en', transcript, report: {
          ...common, format: 'bait-moonshine-benchmark-v1', package: '@moonshine-ai/moonshine-wasm@0.1.5', model: worker.metrics.model,
          language: 'en', source: 'Local file, real-time replay', elapsedMs: performance.now() - started.current,
          cachePolicy: 'Existing Moonshine SDK delivery and cache behavior unchanged; cold vs warm cache state was not measured.',
          totalAudioPacketProcessingMs: worker.metrics.passes.reduce((a, b) => a + b, 0),
          p95AudioPacketProcessingMs: percentile(worker.metrics.passes, .95),
          p95ReplaySchedulingDelayMs: percentile(scheduling, .95),
          p95FinalLineLagMs: percentile(samples.current.flatMap((sample) => sample.lastWordLagMs === null ? [] : [sample.lastWordLagMs]), .95),
          transcript, lines: samples.current,
          confidencePolicy: 'Moonshine 0.1.5 word confidence is an upstream constant 1.0 placeholder, not a probability. It cannot filter recognition errors.',
          processingMetric: 'Worker addAudio + transcribe calls and final flush; packet-processing timings, not isolated model inference passes.',
        } };
      }
      setResults((previous) => [...previous.slice(-7), result]); setStatus('Comparison complete. Switch models to check the same file.');
    } catch (error) {
      if (valid()) stop(error instanceof Error ? error.message : 'The comparison could not finish.');
    } finally { if (valid()) { active.current = false; setRunning(false); } }
  };
  const testMic = async () => {
    if (provider !== 'whisper' || !ready || active.current || !whisper.current) return;
    const current = generation.current;
    const valid = () => generation.current === current;
    const worker = whisper.current;
    const recorder = new MicrophoneSample();
    micSample.current = recorder;
    active.current = true; setRunning(true); setRecordingMic(true);
    setStatus('Speak one short phrase. Recording stops after five seconds.');
    try {
      // Called inside the explicit click, before any asynchronous operation.
      const pcm = await recorder.capture(5);
      if (!valid()) return;
      micSample.current = null; setRecordingMic(false);
      if (pcm.length === 0) {
        setStatus('No audio captured. Whisper is still ready; start another microphone sample when you are ready.');
        return;
      }
      setStatus('Microphone released. Whisper is transcribing your sample on this computer.');
      const output = await worker.transcribe(pcm, language, { wordTimestamps: true });
      if (!valid()) return;
      setResults((previous) => [...previous.slice(-7), {
        provider: 'whisper', language, transcript: output.text,
        report: {
          format: 'baited-whisper-microphone-probe-v1', at: new Date().toISOString(), label,
          source: 'Explicit microphone sample, stopped before inference', audioSeconds: pcm.length / 16000,
          sampleRate: 16000, language, model: WHISPER_MODEL, revision: WHISPER_REVISION,
          userAgent: navigator.userAgent, inferenceMs: output.inferenceMs, transcript: output.text,
          wordTimestamps: output.chunks ?? [],
          privacy: 'Audio stays in this browser. No recording saved, audio upload, game commands or scoring.',
          confidencePolicy: 'Whisper supplies no calibrated word confidence. This result cannot award a win or submit a guess.',
          timingPolicy: 'Five-second microphone sample, then inference. This is not continuous recognition or end-to-end game latency.',
        },
      }]);
      setStatus('Microphone comparison complete. Check the words against what you said. Game scoring is unchanged.');
    } catch (error) {
      if (valid()) stop(error instanceof Error ? error.message : 'The microphone comparison could not finish.');
    } finally {
      recorder.close();
      if (valid()) { micSample.current = null; active.current = false; setRunning(false); setRecordingMic(false); }
    }
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(results.map((result) => result.report), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'baited-speech-comparison.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main style={{ maxWidth: 960, padding: '40px 24px', margin: '0 auto' }}>
    <a href="/studio">Back to Baited Studio</a><h1>Speech bench</h1>
    <p>Compare a recording or test your microphone on this computer. This page does not control rounds, submit guesses or upload audio.</p>
    <p>Use the same clip with OBS idle, then recording. Only one model stays loaded. Switching or stopping unloads it.</p>
    <section aria-label="Comparison setup" style={{ display: 'grid', gap: 16, paddingBlock: 16 }}>
      <label>Model <select aria-label="Model" value={provider} onChange={(event) => { stop('Model switched. Load it when ready.'); setProvider(event.target.value as Provider); }}>
        <option value="moonshine">Moonshine Tiny · live-speed replay</option>{whisperAvailable && <option value="whisper">Whisper Tiny · experimental comparison</option>}
      </select></label>
      {provider === 'whisper' ? <>
        <p>Multilingual Tiny, q8, one WASM thread. About 59 MB of model and runtime files served from this site. Model reads bypass the browser cache; runtime modules may be cached. Recognition stops after three minutes if it gets stuck. This comparison does not replace Moonshine in Studio.</p>
        <a href="/licenses/speech-bench/DISTRIBUTION-NOTICES.md">Model and runtime licenses</a>
        <label>Recording language <select aria-label="Recording language" value={language} onChange={(event) => setLanguage(event.target.value as WhisperLanguage)} disabled={running}>
          <option value="en">English</option><option value="hr">Croatian</option>
        </select></label>
      </> : <p>English Tiny Streaming. About 84 MB plus the runtime on first load. Model files come from the existing Moonshine delivery path; your audio stays here.</p>}
      <div><button type="button" onClick={() => void load()} disabled={loading || running}>{ready ? 'Reload model' : `Load ${provider === 'whisper' ? 'Whisper' : 'Moonshine'}`}</button></div>
      <label>Run label <input aria-label="Run label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={running} /></label>
      <label>Local WAV <input aria-label="Local audio" type="file" accept=".wav,audio/wav,audio/x-wav" disabled={running} onChange={(event) => { setFile(event.target.files?.[0] ?? null); decoded.current = null; }} /></label>
      <small>Uncompressed WAV, mono or stereo, up to 25 MB and {provider === 'whisper' ? 'one minute' : 'five minutes'}. Convert other formats to WAV first. Start with a 10–20 second voice clip. Keep this tab visible while measuring.</small>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" onClick={() => void run()} disabled={!ready || !file || running || loading}>Run comparison</button>
        <button type="button" onClick={() => stop()} disabled={!loading && !running && !ready}>Stop and unload</button>
      </div>
    </section>
    {provider === 'whisper' && <section aria-label="Microphone comparison" style={{ borderTop: '1px solid #736480', paddingBlock: 20 }}>
      <h2>Try Whisper with your mic</h2>
      <p>Pause your game and disable Studio's microphone first. Record one phrase for up to five seconds, then compare the text. The microphone closes before transcription begins.</p>
      <p>Whisper can lag behind the game clock, especially in Firefox. A transcript here will never submit a guess or count as a catch.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void testMic()} disabled={!ready || running || loading}>Test microphone (5 seconds)</button>
        {recordingMic && <button type="button" onClick={() => micSample.current?.finish()}>Finish sample</button>}
        {recordingMic && <button type="button" onClick={() => stop('Microphone test canceled. Load the model to try again.')}>Cancel sample</button>}
      </div>
    </section>}
    <p role="status" aria-live="polite">{status}</p>
    {running && provider === 'moonshine' && <section aria-label="Recognized speech"><h2>Final phrases</h2>{lines.map(({ line }, index) => <p key={`${line.id}-${index}`}>{line.text}</p>)}</section>}
    {results.length > 0 && <section><h2>Results</h2>
      <p>Compare the words against what was actually said. Whisper's whole-file processing time is different from Moonshine's live phrase delay. These recordings alone do not establish command accuracy.</p>
      <button type="button" onClick={save}>Download comparison JSON</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20, marginTop: 24 }}>
        {results.map((result, index) => <article key={index} style={{ borderTop: '1px solid #736480', paddingTop: 12 }}>
          <h3>{result.provider === 'whisper' ? 'Whisper' : 'Moonshine'} · {result.language === 'hr' ? 'Croatian' : 'English'}</h3>
          <p>{String(result.report.label)} · {String(result.report.file ?? 'Microphone sample')}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.transcript || 'No speech returned.'}</p>
          <details><summary>Measured details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.report, null, 2)}</pre></details>
        </article>)}
      </div>
    </section>}
    <aside style={{ marginTop: 32 }}><p>Browser speech recognition is a separate comparison. It is not enabled here: support varies, and some browsers send audio to their provider. This comparison uses no browser speech service.</p></aside>
  </main>;
}
