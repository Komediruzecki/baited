import { useEffect, useRef, useState } from 'react';
import { Moonshine, type MoonshineLine } from './moonshine';
import { ONNX_VERSION, TRANSFORMERS_VERSION, WHISPER_MAX_SECONDS, WHISPER_MODEL, WHISPER_REVISION, WhisperBench, type WhisperLanguage } from './speech-bench/whisper-client';
import { decodeBenchAudio, type BenchAudio } from './speech-bench/audio';

type Provider = 'moonshine' | 'whisper';
type Sample = { line: MoonshineLine; deliveredMs: number; lastWordLagMs: number | null };
type Result = { provider: Provider; language: string; transcript: string; report: Record<string, unknown> };
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
};

/** Developer file replay only. This component never connects a mic or a game session. */
export function SpeechLab() {
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
    moonshine.current?.close(); moonshine.current = null;
    whisper.current?.close(); whisper.current = null;
  };
  useEffect(() => () => { dispose(); decoded.current = null; }, []);
  const stop = (message = 'Stopped. Load the model again to continue.') => {
    dispose(); setReady(false); setLoading(false); setRunning(false); setStatus(message);
  };
  const load = async () => {
    dispose();
    const current = generation.current;
    const valid = () => generation.current === current;
    setReady(false); setLoading(true); setLines([]);
    setStatus(provider === 'whisper' ? 'Loading Whisper Tiny from this preview' : 'Loading Moonshine Tiny');
    const start = performance.now();
    try {
      if (provider === 'whisper') {
        if (!import.meta.env.DEV) throw new Error('Whisper comparison is available in the local development preview.');
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
          cachePolicy: 'Browser model cache and WASM cache disabled; all prepared assets served with Cache-Control: no-store. OS filesystem cache may still affect timings.',
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
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(results.map((result) => result.report), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'baited-speech-comparison.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main style={{ maxWidth: 960, padding: '40px 24px', margin: '0 auto' }}>
    <a href="/studio">Back to Baited Studio</a><h1>Speech bench</h1>
    <p>Compare a recording on this computer. Nothing here starts a game, opens your microphone or uploads your recording.</p>
    <p>Use the same clip with OBS idle, then recording. Only one model stays loaded. Switching or stopping unloads it.</p>
    <section aria-label="Comparison setup" style={{ display: 'grid', gap: 16, paddingBlock: 16 }}>
      <label>Model <select aria-label="Model" value={provider} onChange={(event) => { stop('Model switched. Load it when ready.'); setProvider(event.target.value as Provider); }}>
        <option value="moonshine">Moonshine Tiny · live-speed replay</option>{import.meta.env.DEV && <option value="whisper">Whisper Tiny · file transcription</option>}
      </select></label>
      {provider === 'whisper' ? <>
        <p>Multilingual Tiny, q8, one WASM thread. About 59 MB of prepared same-origin model and runtime files. Each load reads those files again; browser caching is disabled. Recognition stops after three minutes if it gets stuck.</p>
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
    <p role="status" aria-live="polite">{status}</p>
    {running && provider === 'moonshine' && <section aria-label="Recognized speech"><h2>Final phrases</h2>{lines.map(({ line }, index) => <p key={`${line.id}-${index}`}>{line.text}</p>)}</section>}
    {results.length > 0 && <section><h2>Results</h2>
      <p>Compare the words against what was actually said. Whisper's whole-file processing time is different from Moonshine's live phrase delay. These recordings alone do not establish command accuracy.</p>
      <button type="button" onClick={save}>Download comparison JSON</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20, marginTop: 24 }}>
        {results.map((result, index) => <article key={index} style={{ borderTop: '1px solid #736480', paddingTop: 12 }}>
          <h3>{result.provider === 'whisper' ? 'Whisper' : 'Moonshine'} · {result.language === 'hr' ? 'Croatian' : 'English'}</h3>
          <p>{String(result.report.label)} · {String(result.report.file)}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.transcript || 'No speech returned.'}</p>
          <details><summary>Measured details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.report, null, 2)}</pre></details>
        </article>)}
      </div>
    </section>}
    <aside style={{ marginTop: 32 }}><p>Browser speech recognition is a separate comparison. It is not enabled here: support varies, and some browsers send audio to their provider. This file bench uses no browser speech service.</p></aside>
  </main>;
}
