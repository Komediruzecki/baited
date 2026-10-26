import { useEffect, useRef, useState } from 'react';
import { Moonshine, type MoonshineLine } from './moonshine';

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
};
type Sample = { line: MoonshineLine; deliveredMs: number; lastWordLagMs: number | null };

/** A local file is replayed at microphone speed. No audio or transcript leaves this page. */
export function SpeechLab() {
  const [status, setStatus] = useState('Model not loaded'), [ready, setReady] = useState(false),
    [running, setRunning] = useState(false), [file, setFile] = useState<File | null>(null),
    [label, setLabel] = useState('baseline'), [report, setReport] = useState(''), [lines, setLines] = useState<Sample[]>([]);
  const model = useRef<Moonshine | null>(null), cancelled = useRef(false), started = useRef(0),
    samples = useRef<Sample[]>([]), loadMs = useRef(0), runLabel = useRef('baseline');
  useEffect(() => () => { cancelled.current = true; model.current?.close(); }, []);
  const load = async () => {
    setStatus('Loading Moonshine');
    const start = performance.now();
    model.current?.close();
    const worker = new Moonshine((line) => {
      const deliveredMs = performance.now() - started.current;
      const end = line.words.at(-1)?.end;
      const sample = { line, deliveredMs, lastWordLagMs: end === undefined ? null : deliveredMs - end * 1000 };
      samples.current.push(sample); setLines([...samples.current]);
    }, setStatus, (message) => { cancelled.current = true; setStatus(message); setRunning(false); });
    model.current = worker;
    try { await worker.load(); loadMs.current = performance.now() - start; setReady(true); setStatus('Moonshine Tiny ready'); }
    catch (error) { setStatus((error as Error).message); setReady(false); worker.close(); }
  };
  const run = async () => {
    if (!model.current || !file) return;
    cancelled.current = false; samples.current = []; setLines([]); setReport(''); setRunning(true);
    runLabel.current = label;
    const worker = model.current;
    let context: OfflineAudioContext | undefined;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose an audio file smaller than 25 MB.');
      setStatus('Decoding local audio');
      context = new OfflineAudioContext(1, 1, 16000);
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration > 300) throw new Error('Use an audio file up to five minutes long.');
      const pcm = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const values = decoded.getChannelData(channel);
        for (let i = 0; i < pcm.length; i++) pcm[i] += values[i] / decoded.numberOfChannels;
      }
      await worker.start();
      started.current = performance.now();
      const scheduling: number[] = [];
      for (let i = 0; i < pcm.length; i += 2048) {
        if (cancelled.current) throw new Error('Benchmark stopped.');
        const end = Math.min(i + 2048, pcm.length);
        const due = started.current + end / 16;
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
        scheduling.push(performance.now() - due);
        worker.audio(pcm.subarray(i, end));
        setStatus(`Replaying ${Math.floor(end / 16000)} / ${Math.ceil(decoded.duration)} seconds`);
      }
      await worker.finish();
      const elapsedMs = performance.now() - started.current;
      const report = {
        format: 'bait-moonshine-benchmark-v1', at: new Date().toISOString(), label: runLabel.current,
        source: 'local file, real-time replay; no microphone or game scoring', file: file.name,
        package: '@moonshine-ai/moonshine-wasm@0.1.5', model: worker.metrics.model,
        crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency,
        audioSeconds: pcm.length / 16000, loadMs: loadMs.current, elapsedMs,
        totalAudioPacketProcessingMs: worker.metrics.passes.reduce((a, b) => a + b, 0),
        p95AudioPacketProcessingMs: percentile(worker.metrics.passes, .95),
        p95ReplaySchedulingDelayMs: percentile(scheduling, .95),
        p95FinalLineLagMs: percentile(samples.current.flatMap((s) => s.lastWordLagMs === null ? [] : [s.lastWordLagMs]), .95),
        transcript: samples.current.map((s) => s.line.text).join(' '), lines: samples.current,
        confidencePolicy: 'Moonshine 0.1.5 word confidence is an upstream constant 1.0 placeholder, not a probability. It cannot filter recognition errors. Human-voice accuracy is not established.',
        processingMetric: 'Worker addAudio + transcribe calls and final flush. The SDK skips some inference calls below its update interval; these are packet-processing timings, not isolated model inference passes.',
      };
      setReport(JSON.stringify(report, null, 2)); setStatus('Benchmark complete');
    } catch (error) { worker.reset(); setStatus((error as Error).message); }
    finally { setRunning(false); }
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `bait-moonshine-${runLabel.current.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main style={{ maxWidth: 900, padding: '40px 24px', margin: '0 auto' }}>
    <a href="/">← BAIT studio</a><h1>Speech bench</h1>
    <p>Replay the same local audio with OBS idle, then recording. Moonshine runs in a worker on this computer. This page does not send audio or text to the game server.</p>
    <p>English Tiny Streaming. About 84 MB of model files plus the runtime on first load. Keep this tab visible while measuring. Human voices and your real OBS scene still need a separate check.</p>
    <button type="button" onClick={() => void load()} disabled={running || status.startsWith('Loading')}>{ready ? 'Reload model' : 'Load Moonshine'}</button>
    <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
      <label>Run label <input aria-label="Run label" value={label} onChange={(e) => setLabel(e.target.value)} disabled={running} /></label>
      <label>Local audio <input aria-label="Local audio" type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={running} /></label>
      <div><button onClick={() => void run()} disabled={!ready || !file || running}>Run benchmark</button>{' '}
        <button onClick={() => { cancelled.current = true; model.current?.reset(); }} disabled={!running}>Stop</button></div>
    </div>
    <p role="status" aria-live="polite">{status}</p>
    <section aria-label="Recognized speech"><h2>Final words</h2>{lines.map(({ line }, i) => <p key={`${line.id}-${i}`}>{line.text} <small>({line.words.length} timed words)</small></p>)}</section>
    {report && <section><h2>Measured result</h2><button onClick={save}>Download JSON</button><pre id="speech-benchmark-report" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report}</pre></section>}
  </main>;
}
