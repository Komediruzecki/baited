import { useEffect, useRef, useState } from 'react';
import { previewWav } from './speech-bench/audio';
import { ComparisonSession, type LabPlan, type LabState, type LabResult } from './speech-bench/comparison-session';
import { browserLabDependencies } from './speech-bench/lab-models';
import { WHISPER_MODEL, WHISPER_REVISION, type WhisperLanguage } from './speech-bench/whisper-client';
import { productBrand } from './ui';
import './speech-lab.css';

/* Operate: one retained clip anchors the comparison. Inherit Studio's violet,
   charcoal panels, Inter typography and button chrome. Record/select, listen,
   then compare. The running model owns the progress rail; transcripts survive
   retry. On phones the controls precede that rail in one column. */
type Availability = 'checking' | 'available' | 'unavailable';
const seconds = (value: number) => `${value.toFixed(1)}s`;
const milliseconds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} ms` : 'Not measured';

function Result({ result }: { result: LabResult }) {
  const report = result.report, moonshine = result.provider === 'moonshine';
  const failed = result.failure !== undefined || report.status === 'error';
  return <article className="speech-lab-result" data-error={failed}>
    <header><h3>{moonshine ? 'Moonshine Tiny' : 'Whisper Tiny'}</h3><span>{report.language === 'hr' ? 'Croatian' : 'English'}</span></header>
    <p className="speech-lab-result-label">{String(report.label || 'Unlabelled run')} · {String(report.file)}</p>
    {failed ? <>
      <p className="speech-lab-failure"><strong>Could not run this model</strong>{result.failure || 'Try this model again with the same clip.'}</p>
      <p className="speech-lab-note">Your clip is still available above to listen to, download or compare again.</p>
    </> : <>
      <p className="speech-lab-transcript">{result.transcript || 'No speech returned. Listen to the clip and try another model.'}</p>
      <dl className="speech-lab-metrics">
        <div><dt>Model load</dt><dd>{milliseconds(report.loadMs)}</dd></div>
        <div><dt>{moonshine ? 'Final phrase lag (p95)' : 'Whole-clip processing'}</dt><dd>{milliseconds(moonshine ? report.p95FinalLineLagMs : report.inferenceMs)}</dd></div>
      </dl>
      <p className="speech-lab-note">{moonshine ? 'Delay after the end of a phrase during original-speed replay.' : 'Time to transcribe the captured clip. This is not live phrase delay.'}</p>
      {Array.isArray(report.warnings) && report.warnings.filter((warning): warning is string => typeof warning === 'string').map(warning => <p key={warning} className="speech-lab-note"><strong>Timing note:</strong> {warning}</p>)}
    </>}
    <details><summary>{failed ? 'Failure details' : 'Words, timing and model details'}</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
  </article>;
}

/** Local diagnostics only. Never opens a game session or browser speech service. */
export function SpeechLab() {
  const controller = useRef<ComparisonSession | null>(null);
  if (!controller.current) controller.current = new ComparisonSession(browserLabDependencies, (next) => setState(next));
  const session = controller.current;
  const [state, setState] = useState<LabState>(session.state);
  const [availability, setAvailability] = useState<Availability>('checking');
  const [plan, setPlan] = useState<LabPlan>('both');
  const [language, setLanguage] = useState<WhisperLanguage>('en');
  const [duration, setDuration] = useState(10), [label, setLabel] = useState('OBS idle');
  const [preview, setPreview] = useState<{ clip: NonNullable<LabState['clip']>; url: string } | null>(null);
  const previewUrl = preview && preview.clip === state.clip ? preview.url : null;
  const playback = useRef<HTMLAudioElement | null>(null), fileInput = useRef<HTMLInputElement | null>(null);
  const recording = state.phase === 'recording' || state.phase === 'permission';
  const comparing = state.phase === 'loading' || state.phase === 'running';
  const clipSeconds = state.clip ? state.clip.pcm.length / 16000 : 0;

  useEffect(() => {
    session.observe(setState);
    const interrupt = () => { if (document.hidden && session.state.busy) session.cancel('Stopped when this tab was hidden. Your clip is ready to compare again.'); };
    const leave = () => session.cancel();
    document.addEventListener('visibilitychange', interrupt); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', interrupt); window.removeEventListener('pagehide', leave); session.destroy(); };
  }, [session]);
  useEffect(() => {
    const abort = new AbortController(); let mounted = true;
    const timer = setTimeout(() => abort.abort(), 10000);
    // The dev plugin verifies and serves the pinned manifest. Deployed builds
    // expose an explicit marker even when the optional assets are omitted.
    const markerPath = import.meta.env.DEV ? 'manifest.json' : 'availability.json';
    void fetch(`/speech-bench-assets/${markerPath}`, { signal: abort.signal, credentials: 'omit', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
        const marker = await response.json();
        if ((!import.meta.env.DEV && marker.available !== true) || marker.model !== WHISPER_MODEL || marker.revision !== WHISPER_REVISION) throw new Error('Unavailable');
        if (mounted) setAvailability('available');
      }).catch(() => { if (mounted) { setAvailability('unavailable'); setPlan('moonshine'); } })
      .finally(() => clearTimeout(timer));
    return () => { mounted = false; clearTimeout(timer); abort.abort(); };
  }, []);
  useEffect(() => {
    if (!state.clip) { setPreview(null); return; }
    const url = URL.createObjectURL(previewWav(state.clip.pcm)); setPreview({ clip: state.clip, url });
    return () => URL.revokeObjectURL(url);
  }, [state.clip]);
  const pausePlayback = () => playback.current?.pause();
  const compare = (chosen = plan) => { pausePlayback(); void session.compare(chosen, language, label); };
  const record = () => { pausePlayback(); void session.record(duration); };
  const discard = () => { pausePlayback(); session.discard(); if (fileInput.current) fileInput.current.value = ''; };
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.results.map(result => result.report), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'baited-speech-comparison.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const models = [
    { id: 'moonshine', name: 'Moonshine Tiny', description: 'English · original-speed replay' },
    { id: 'whisper', name: 'Whisper Tiny', description: 'English or Croatian · whole-clip transcription' },
  ] as const;
  return <div className="speech-lab">
    <header className="speech-lab-header"><a className="speech-lab-brand" href="/studio" aria-label="Baited Studio">{productBrand}</a><a className="button secondary" href="/studio">Back to Studio</a></header>
    <main className="speech-lab-main">
      <div className="speech-lab-title"><p className="speech-lab-kicker">Speech lab</p><h1>Record once. Compare the words.</h1><p>Give Moonshine and Whisper the same clip. Listen back, compare the words they return, then try again.</p><p className="speech-lab-scope"><strong>For comparison.</strong> Choose a model below to test its accuracy. Studio keeps using Moonshine for live rounds.</p></div>
      <div className="speech-lab-workspace">
        <section className="speech-lab-input" aria-labelledby="speech-lab-clip-title">
          <div className="speech-lab-section-title"><h2 id="speech-lab-clip-title">Your clip</h2><span>{state.clip ? `${seconds(clipSeconds)} · kept in this tab` : 'Microphone or WAV'}</span></div>
          <p>Pause your game and turn off Studio’s microphone before recording. The microphone closes before either model runs.</p>
          <div className="speech-lab-record-controls">
            <label>Recording length<select aria-label="Recording length" value={duration} onChange={event => setDuration(Number(event.target.value))} disabled={state.busy}><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option></select></label>
            <button className="button primary" type="button" onClick={record} disabled={state.busy}>{state.clip ? 'Record again' : 'Record a phrase'}</button>
          </div>
          {recording && <div className="speech-lab-recording"><div><strong>{state.phase === 'permission' ? 'Waiting for permission' : `${seconds(state.seconds)} / ${duration}s`}</strong><meter min="0" max="1" value={state.level} aria-label="Microphone input level" /></div><div className="speech-lab-actions"><button className="button secondary" type="button" disabled={state.phase === 'permission'} onClick={() => session.finishRecording()}>Finish recording</button><button className="button secondary" type="button" onClick={() => session.cancel()}>Cancel recording</button></div></div>}
          <div className="speech-lab-file"><label htmlFor="speech-lab-file">Or choose a WAV</label><input ref={fileInput} id="speech-lab-file" type="file" accept=".wav,audio/wav,audio/x-wav" disabled={state.busy} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) { pausePlayback(); void session.readFile(file); } }} /><p className="speech-lab-note">Uncompressed WAV, up to 25 MB. Both models: up to one minute. Moonshine alone: up to five minutes.</p></div>
          {state.clip && <div className="speech-lab-preview">
            <div className="speech-lab-preview-heading"><strong>{state.clip.name}</strong><button type="button" className="speech-lab-text-button" disabled={state.busy} onClick={discard}>Discard clip</button></div>
            {previewUrl && <>
              <audio ref={playback} controls preload="metadata" src={previewUrl} aria-label="Listen to your comparison clip" onPlay={() => { if (session.state.busy) pausePlayback(); }} />
              <div className="speech-lab-actions speech-lab-preview-actions"><a className="button secondary" href={previewUrl} download={state.clip.source === 'microphone' ? 'baited-recording.wav' : 'baited-comparison.wav'}>{state.clip.source === 'microphone' ? 'Download recording' : 'Download WAV'}</a></div>
            </>}
          </div>}
          <div className="speech-lab-options">
            <label>Language<select aria-label="Language" value={language} disabled={state.busy} onChange={event => { const value = event.target.value as WhisperLanguage; setLanguage(value); if (value === 'hr') setPlan('whisper'); }}><option value="en">English · both models</option><option value="hr" disabled={availability !== 'available'}>Croatian · Whisper only</option></select></label>
            <label>Compare with<select aria-label="Compare with" value={plan} disabled={state.busy} onChange={event => setPlan(event.target.value as LabPlan)}><option value="both" disabled={availability !== 'available' || language !== 'en'}>Both models</option><option value="moonshine" disabled={language !== 'en'}>Moonshine only</option><option value="whisper" disabled={availability !== 'available'}>Whisper only</option></select></label>
            <label className="speech-lab-run-label">Run label<input value={label} maxLength={120} disabled={state.busy} onChange={event => setLabel(event.target.value)} placeholder="For example: OBS recording" /></label>
          </div>
          <div className="speech-lab-actions"><button className="button primary" type="button" disabled={!state.clip || state.busy || (plan !== 'moonshine' && availability !== 'available')} onClick={() => compare()}>{plan === 'both' ? 'Compare both models' : `Run ${plan === 'moonshine' ? 'Moonshine' : 'Whisper'}`}</button>{comparing && <button className="button secondary" type="button" onClick={() => session.cancel()}>Stop comparison</button>}</div>
          <p className="speech-lab-note">Loading starts when you compare. Only one model stays loaded. Keep this tab visible while measuring.</p>
        </section>
        <aside className="speech-lab-progress" aria-label="Comparison progress">
          <div className="speech-lab-status" data-error={state.phase === 'error'}><span className={`speech-lab-status-dot${state.busy ? ' is-working' : ''}`} aria-hidden="true" /><h2>{state.phase === 'error' ? 'Ready to retry' : state.busy ? 'Comparison in progress' : state.phase === 'complete' ? 'Results are ready' : 'Ready when you are'}</h2><p role={state.phase === 'error' ? 'alert' : 'status'} aria-live="polite">{state.message}</p>{state.busy && <progress aria-label="Comparison progress" {...(state.phase === 'recording' ? { value: state.seconds, max: duration } : state.phase === 'running' && state.provider === 'moonshine' ? { value: state.seconds, max: clipSeconds } : {})} />}{state.phase === 'reading' && <button type="button" className="button secondary" onClick={() => session.cancel()}>Cancel reading</button>}</div>
          <ol className="speech-lab-models">{models.map(model => { const result = state.results.filter(item => item.provider === model.id).at(-1); const current = state.provider === model.id && comparing; const failed = result?.failure !== undefined || result?.report.status === 'error'; const unavailable = model.id === 'whisper' && availability !== 'available'; return <li key={model.id} data-current={current}><div><h3>{model.name}</h3><span>{current ? state.phase === 'loading' ? 'Loading' : 'Running' : failed ? 'Could not run' : unavailable ? availability === 'checking' ? 'Checking host' : 'Unavailable here' : result ? 'Result saved' : 'Not loaded'}</span></div><p>{model.description}</p>{result && <button type="button" className="speech-lab-text-button" disabled={state.busy || unavailable || (model.id === 'moonshine' && language === 'hr')} onClick={() => compare(model.id)}>Run {model.name.split(' ')[0]} again</button>}</li>; })}</ol>
          {availability === 'unavailable' && <p className="speech-lab-note">Whisper’s model files aren’t available on this host. You can still try Moonshine.</p>}
          <p className="speech-lab-note">Moonshine is the live recognizer in Studio. Whisper here is an optional comparison. These tests don’t change your game’s model.</p>
        </aside>
      </div>
      <section className="speech-lab-results" aria-labelledby="speech-lab-results-title"><div className="speech-lab-section-title"><h2 id="speech-lab-results-title">What each model heard</h2>{state.results.length > 0 && <button className="button secondary" type="button" onClick={save}>Download comparison JSON</button>}</div><p>Each model writes down the words it recognizes. Whole-clip processing and live phrase delay measure different things. Neither number is end-to-end game latency.</p>{state.results.length ? <div className="speech-lab-result-grid">{[...state.results].reverse().map((result, index) => <Result key={`${String(result.report.at)}-${index}`} result={result} />)}</div> : <p className="speech-lab-empty">Recognized words and any model errors will appear here. You can stop or retry without losing a finished result.</p>}</section>
      <footer className="speech-lab-footer"><p>Download saves a WAV copy. Discard clears the tab’s copy. No audio uploads, browser speech service, game commands or scoring.</p><details><summary>Model downloads and measurement notes</summary><p>Moonshine Tiny uses about 84 MB plus its runtime. Whisper Tiny uses about 59 MB of model and runtime files from this host. Whisper model reads bypass the browser cache; runtime modules may be cached. First-load time is shown separately from recognition.</p><p>Moonshine’s confidence field is a placeholder. Whisper supplies no calibrated word confidence. These results don’t establish command accuracy.</p><a href="/licenses/speech-bench/DISTRIBUTION-NOTICES.md">Whisper model and runtime licenses</a></details></footer>
    </main>
  </div>;
}
