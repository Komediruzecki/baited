import { useEffect, useRef, useState } from 'react';
import { PronunciationTake } from './card-pronunciation-model';
import { Moonshine } from './moonshine';
import { Mic, MicOff, Check, RotateCcw } from './icons';
import { Button } from './ui';

/** Local-only capture. It has no game session, speech socket, scoring or persistence path. */
export function CardPronunciation({ word, spellings, disabled }: {
  word: string; spellings: string[]; disabled: boolean;
}) {
  const [status, setStatus] = useState('off');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [matched, setMatched] = useState(false);
  const current = useRef<{ stop: () => void; finish: () => Promise<void> } | null>(null);
  const target = useRef({ word, spellings });
  target.current = { word, spellings };
  const running = status !== 'off';
  const capabilityMessage = typeof window === 'undefined' ? ''
    : !window.isSecureContext ? 'Open Studio on HTTPS or localhost to test your microphone.'
      : !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined' || typeof Worker === 'undefined'
        ? 'This browser does not support the microphone test. Try another browser.'
        : !window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined'
          ? 'Local speech is unavailable in this page. Open the standalone Studio on HTTPS or localhost and reload it.' : '';
  const stop = () => { current.current?.stop(); current.current = null; setStatus('off'); };
  useEffect(() => {
    stop(); setText(''); setMatched(false); setError('');
    return () => { current.current?.stop(); current.current = null; };
  }, [word, JSON.stringify(spellings), disabled]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setText(''); setMatched(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const start = async () => {
    if (disabled || capabilityMessage || !/^[a-z]{2,24}$/i.test(word)) return;
    stop(); setText(''); setMatched(false); setError(''); setStatus('Loading Moonshine');
    let cancelled = false, finishing = false, stream: MediaStream | undefined, context: AudioContext | undefined;
    let worklet: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drained: (() => void) | undefined;
    const take = new PronunciationTake();
    const model = new Moonshine((line) => {
      if (cancelled) return;
      setText(line.text.slice(-800));
      if (take.hears(line, target.current.word, target.current.spellings)) setMatched(true);
    }, (message) => { if (!cancelled) setStatus(message); }, (message) => {
      if (!cancelled) { owner.stop(); current.current = null; setStatus('off'); setError(message); }
    });
    const owner = { stop() {
      cancelled = true; clearTimeout(timer); drained?.();
      worklet?.disconnect(); source?.disconnect();
      stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
      void context?.close().catch(() => {}); model.close();
    }, async finish() {
      if (cancelled || finishing) return;
      finishing = true; clearTimeout(timer); setStatus('Finishing test');
      try {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 500);
          drained = () => { clearTimeout(timeout); resolve(); };
          worklet?.port.postMessage({ flush: true, enabled: false, generation: 1 });
        });
        if (cancelled) return;
        stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
        await model.finish();
      } catch (cause) { if (!cancelled) setError((cause as Error).message); }
      finally { if (!cancelled) { owner.stop(); current.current = null; setStatus('off'); } }
    } };
    current.current = owner;
    try {
      await model.load();
      if (cancelled) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      }, video: false });
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      context = new AudioContext(); await context.resume();
      await context.audioWorklet.addModule('/pcm-worklet.js');
      if (cancelled) { void context.close().catch(() => {}); return; }
      await model.start();
      if (cancelled) return;
      source = context.createMediaStreamSource(stream);
      worklet = new AudioWorkletNode(context, 'bait-pcm');
      const mute = context.createGain(); mute.gain.value = 0;
      source.connect(worklet); worklet.connect(mute); mute.connect(context.destination);
      worklet.port.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; flushed?: boolean }>) => {
        if (event.data.flushed) { drained?.(); return; }
        if (cancelled || !event.data.buffer) return;
        try { model.audio(Float32Array.from(new Int16Array(event.data.buffer), (value) => value / 32768)); }
        catch (cause) { owner.stop(); current.current = null; setStatus('off'); setError((cause as Error).message); }
      };
      worklet.port.postMessage({ enabled: true, generation: 1 });
      stream.getTracks().forEach((track) => { track.onended = () => {
        if (!cancelled) { owner.stop(); current.current = null; setStatus('off'); setError('Microphone disconnected. Reconnect it and try again.'); }
      }; });
      setStatus('listening');
      timer = setTimeout(() => {
        if (!cancelled) void owner.finish();
      }, 60000);
    } catch (cause) {
      if (cancelled) return;
      owner.stop(); current.current = null; setStatus('off');
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in your browser and try again.'
        : cause instanceof Error ? cause.message : 'Could not open the microphone. Try again on HTTPS or localhost.');
    }
  };
  return <section className="card-maker__pronunciation" aria-label="Private pronunciation test">
    <div className="card-maker__subheading"><h3>Try saying it</h3><span>Private test</span></div>
    <p>Say the word in a sentence. Audio and text stay in this tab. Nothing reaches the round or OBS.</p>
    {capabilityMessage && <p className="card-maker__hint" role="status">{capabilityMessage}</p>}
    {disabled && <p className="card-maker__hint">Finish the round and turn off the Studio microphone to test a card.</p>}
    <Button className="secondary" disabled={!running && (disabled || !!capabilityMessage || !/^[a-z]{2,24}$/i.test(word))}
      onClick={() => running ? status === 'listening' ? void current.current?.finish() : stop() : void start()}>
      {running ? <MicOff size={16} /> : <Mic size={16} />}
      {running ? status === 'listening' ? 'Stop test' : status === 'Finishing test' ? 'Cancel test' : 'Cancel loading' : 'Test pronunciation'}
    </Button>
    {running && <p role="status">{status === 'listening' ? 'Listening for up to one minute.' : status}</p>}
    {(text || matched) && <div className="card-maker__transcript" aria-live="polite">
      <p>{text}</p>
      {matched ? <strong><Check size={16} /> Heard “{word}”</strong> : <span>The target has not been heard yet.</span>}
      <Button className="text" onClick={() => { setText(''); setMatched(false); }}><RotateCcw size={14} />Clear text</Button>
      <small>This checks one take. Live catches still need your confirmation.</small>
    </div>}
    {error && <p className="card-maker__field-error" role="alert">{error}</p>}
  </section>;
}
