import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Modal } from './ui';
import { Check, RotateCcw, Trash2, X } from './icons';
import {
  asciiPixels, brushStroke, clonePixels, commitPixels, floodPixels, hasPixels, newPixelDocument,
  pixelHistory, pixelPreset, PIXEL_PALETTES, PIXEL_SIZES, PIXEL_STAMPS, redoPixels, resizePixels,
  stampPixels, undoPixels, validPixelDocument, type PixelDocument, type PixelPalette, type PixelSize, type Point,
} from './pixel-art-model';
import { importPixelImage, pixelPng, renderPixelDocument } from './pixel-art-image';
import './pixel-art-editor.css';

/* Operate surface: extend the Studio workbench. The square drawing area owns the
   viewport, with familiar labelled tools above and colour below. Parts and local
   image conversion sit alongside it. M3 charcoal containers and violet controls
   inherit DESIGN.md; the artwork, not decorative motion, carries the personality. */
export interface PixelArtResult { document: PixelDocument; png: Blob; originalSource?: Blob }
export interface PixelArtEditorProps {
  initialDocument?: PixelDocument;
  initialSource?: Blob;
  onApply: (result: PixelArtResult) => void | Promise<void>;
  onClose: () => void;
}
type Tool = 'pencil' | 'eraser' | 'fill' | 'stamp';
type Pending = { title: string; body: string; label: string; action: () => void };
const tools: { id: Tool; name: string; path: string }[] = [
  { id: 'pencil', name: 'Pencil', path: 'M2 8h2V6H2zM3 5l4-4 2 2-4 4z' },
  { id: 'eraser', name: 'Eraser', path: 'M1 6l5-5 3 3-5 5H3zM3 4l3 3M1 9h8' },
  { id: 'fill', name: 'Fill', path: 'M1 5l4-4 4 4-4 4zM2 5h6M8 7v2' },
  { id: 'stamp', name: 'Stamp', path: 'M3 1h4v3L6 5v2H4V5L3 4zM2 7h6v2H2z' },
];
function PixelToolIcon({ path }: { path: string }) {
  return <svg width="18" height="18" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="miter"><path d={path} /></svg>;
}
function PixelPreview({ doc, edge = 96 }: { doc: PixelDocument; edge?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = canvas.current?.getContext('2d'); if (ctx) renderPixelDocument(ctx, doc, 512); }, [doc]);
  return <canvas ref={canvas} width={512} height={512} style={{ width: edge, height: edge }} aria-label="Current artwork preview" role="img" />;
}

export default function PixelArtEditor({ initialDocument, initialSource, onApply, onClose }: PixelArtEditorProps) {
  const initial = useRef(validPixelDocument(initialDocument) ? clonePixels(initialDocument) : newPixelDocument());
  const sources = useRef(new WeakMap<PixelDocument, Blob>());
  const baselineSource = useRef(validPixelDocument(initialDocument) ? initialSource : undefined);
  const [history, setHistory] = useState(() => {
    const value = pixelHistory(initial.current);
    if (validPixelDocument(initialDocument) && initialSource) sources.current.set(value.present, initialSource);
    return value;
  });
  const [stroke, setStroke] = useState<PixelDocument | null>(null);
  const doc = stroke ?? history.present;
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial.current));
  const dirty = JSON.stringify(doc) !== baseline || sources.current.get(history.present) !== baselineSource.current;
  const [tool, setTool] = useState<Tool>('pencil'), [color, setColor] = useState<string>('#9146ff');
  const [palette, setPalette] = useState<PixelPalette>('baited'), [brush, setBrush] = useState(1), [mirror, setMirror] = useState(false);
  const [stamp, setStamp] = useState('face'), [stampScale, setStampScale] = useState(1);
  const [grid, setGrid] = useState(true), [cursor, setCursor] = useState<Point>({ x: 15, y: 15 });
  const [pending, setPending] = useState<Pending | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(''), [imageName, setImageName] = useState('');
  const [convertPalette, setConvertPalette] = useState<PixelPalette | 'original'>('baited'), [dither, setDither] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const imageFile = useRef<Blob | null>(null), importSequence = useRef(0), mounted = useRef(true);
  const gesture = useRef<{ id: number; last: Point; doc: PixelDocument } | null>(null);
  const id = useId();
  const activeStamp = PIXEL_STAMPS.find((item) => item.id === stamp)!;
  const ascii = useMemo(() => asciiPixels(doc).join('\n'), [doc]);
  const commit = (next: PixelDocument, source: Blob | null | undefined = sources.current.get(history.present)) => {
    if (source) sources.current.set(next, source);
    // Two imports may reduce to the same pixels. Still retain the new original
    // for moderation, and let Undo restore its predecessor's provenance.
    setHistory((previous) => commitPixels(previous, next, (source ?? undefined) !== sources.current.get(previous.present)));
    setStroke(null); setError(''); setNotice('');
  };
  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; importSequence.current++; };
  }, []);
  useEffect(() => {
    // History can restore a different grid size without going through the
    // select control. Keep the keyboard cell inside every restored document.
    setCursor((point) => {
      const x = Math.max(0, Math.min(doc.size - 1, point.x)), y = Math.max(0, Math.min(doc.size - 1, point.y));
      return x === point.x && y === point.y ? point : { x, y };
    });
  }, [doc.size]);
  useEffect(() => {
    if (!initialSource || validPixelDocument(initialDocument)) return;
    const sequence = ++importSequence.current;
    setBusy('Opening artwork');
    void importPixelImage(initialSource, history.present.size, 'original', false).then((next) => {
      if (!mounted.current || sequence !== importSequence.current) return;
      const nextHistory = pixelHistory(next);
      sources.current.set(nextHistory.present, initialSource); baselineSource.current = initialSource;
      setHistory(nextHistory); setBaseline(JSON.stringify(next));
    }).catch((cause) => { if (mounted.current && sequence === importSequence.current) setError((cause as Error).message); }).finally(() => { if (mounted.current && sequence === importSequence.current) setBusy(''); });
  }, []);
  useEffect(() => {
    const source = sources.current.get(history.present);
    imageFile.current = source ?? null;
    setImageName(source ? source instanceof File ? source.name : 'Current card artwork' : '');
  }, [history.present]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    renderPixelDocument(ctx, doc, 512);
    if (grid) {
      ctx.strokeStyle = 'rgba(201,163,255,.18)'; ctx.lineWidth = .6;
      ctx.beginPath();
      for (let n = 1; n < doc.size; n++) { const at = n * 512 / doc.size; ctx.moveTo(at, 0); ctx.lineTo(at, 512); ctx.moveTo(0, at); ctx.lineTo(512, at); }
      ctx.stroke();
    }
  }, [doc, grid]);
  const applyAt = (source: PixelDocument, at: Point, from = at) => tool === 'fill'
    ? floodPixels(source, at, color, mirror)
    : tool === 'stamp' ? stampPixels(source, activeStamp, at, color, '#fffdf7', stampScale, mirror)
      : brushStroke(source, from, at, tool === 'eraser' ? null : color, brush, mirror);
  const pointFor = (event: React.PointerEvent) => {
    const box = drawing.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(doc.size - 1, Math.floor((event.clientX - box.left) / box.width * doc.size))), y: Math.max(0, Math.min(doc.size - 1, Math.floor((event.clientY - box.top) / box.height * doc.size))) };
  };
  const endStroke = (event?: React.PointerEvent) => {
    const current = gesture.current;
    if (!current || event && event.pointerId !== current.id) return;
    gesture.current = null; commit(current.doc);
    if (drawing.current?.hasPointerCapture(current.id)) drawing.current.releasePointerCapture(current.id);
  };
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || !event.isPrimary || event.button !== 0 || gesture.current) return;
    event.preventDefault(); drawing.current?.focus({ preventScroll: true });
    const at = pointFor(event); setCursor(at);
    const next = applyAt(history.present, at);
    if (tool === 'fill' || tool === 'stamp') { commit(next); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, last: at, doc: next }; setStroke(next); setNotice('');
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.id) return;
    event.preventDefault(); const at = pointFor(event); setCursor(at);
    current.doc = applyAt(current.doc, at, current.last); current.last = at; setStroke(current.doc);
  };
  const close = () => {
    if (busy) return;
    if (!dirty) onClose();
    else setPending({ title: 'Leave this drawing?', body: 'These changes have not been applied to your card. Keep drawing or discard them.', label: 'Discard drawing', action: onClose });
  };
  const replace = (next: () => PixelDocument, title: string, body: string) => {
    const action = () => commit(next(), null);
    if (!hasPixels(doc)) action();
    else setPending({ title, body, label: 'Replace drawing', action });
  };
  const importImage = async (file: Blob) => {
    const sequence = ++importSequence.current; setBusy('Converting image'); setError(''); setNotice('');
    try {
      const next = await importPixelImage(file, doc.size, convertPalette, dither);
      if (!mounted.current || sequence !== importSequence.current) return;
      next.renderMode = doc.renderMode; commit(next, file); imageFile.current = file; setImageName(file instanceof File ? file.name : 'Current card artwork');
      setNotice('Image converted. Draw over it, erase pixels or add a part. Undo restores the previous drawing.');
    } catch (cause) { if (mounted.current && sequence === importSequence.current) setError((cause as Error).message); }
    finally { if (mounted.current && sequence === importSequence.current) setBusy(''); }
  };
  const confirmImport = (file: Blob) => {
    if (!hasPixels(doc)) void importImage(file);
    else setPending({ title: 'Replace this drawing with the image?', body: 'The image will fill the grid without stretching. You can undo the conversion to bring this drawing back.', label: 'Convert image', action: () => void importImage(file) });
  };
  const apply = async () => {
    if (busy || !hasPixels(doc)) return;
    setBusy('Preparing artwork'); setError(''); setNotice('');
    const snapshot = clonePixels(doc);
    try {
      const png = await pixelPng(snapshot);
      if (!mounted.current) return;
      setBusy('Applying artwork'); await onApply({ document: snapshot, png, originalSource: sources.current.get(history.present) });
      if (mounted.current) { baselineSource.current = sources.current.get(history.present); setBaseline(JSON.stringify(snapshot)); setNotice('Artwork applied to your card draft.'); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'The artwork could not be applied. Your drawing is still here.'); }
    finally { if (mounted.current) setBusy(''); }
  };
  const download = async () => {
    if (busy || !hasPixels(doc)) return;
    setBusy('Preparing PNG'); setError(''); setNotice('');
    try {
      const png = await pixelPng(clonePixels(doc));
      if (!mounted.current) return;
      const url = URL.createObjectURL(png), link = document.createElement('a');
      link.href = url; link.download = 'baited-artwork.png';
      document.body.append(link); link.click(); link.remove();
      // Give the browser time to begin reading the local Blob before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice('PNG download started. Your drawing is still here.');
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'The PNG could not be downloaded. Your drawing is still here.'); }
    finally { if (mounted.current) setBusy(''); }
  };
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault(); const step = event.shiftKey ? 4 : 1;
      setCursor((point) => ({ x: Math.max(0, Math.min(doc.size - 1, point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))), y: Math.max(0, Math.min(doc.size - 1, point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))) }));
    } else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); commit(applyAt(history.present, cursor)); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); commit(brushStroke(history.present, cursor, cursor, null, brush, mirror)); }
    else if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setHistory((value) => event.shiftKey ? redoPixels(value) : undoPixels(value)); }
  };
  return <section className="pixel-editor" aria-labelledby={`${id}-title`} aria-busy={!!busy}>
    <header className="pixel-editor__header"><div><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>Card artwork</h2><p>Draw a word’s portrait, or turn your own image into pixels.</p></div><Button type="button" className="text" onClick={close} disabled={!!busy} aria-label="Close artwork editor"><X size={20} /></Button></header>
    {error && <p className="pixel-editor__error" role="alert">{error}</p>}
    {notice && <p className="pixel-editor__notice" role="status"><Check size={16} />{notice}</p>}
    <div className="pixel-editor__layout">
      <div className="pixel-editor__drawing-column">
        <div className="pixel-editor__tools" role="group" aria-label="Drawing tools">{tools.map((item) => <button key={item.id} type="button" disabled={!!busy} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}><PixelToolIcon path={item.path} />{item.name}</button>)}<span className="pixel-editor__tools-divider" /><button type="button" aria-label="Undo drawing" disabled={!!busy || !history.past.length} onClick={() => setHistory(undoPixels)}><RotateCcw size={18} /><span className="pixel-editor__tool-text">Undo</span></button><button type="button" aria-label="Redo drawing" disabled={!!busy || !history.future.length} onClick={() => setHistory(redoPixels)}><RotateCcw size={18} style={{ transform: 'scaleX(-1)' }} /><span className="pixel-editor__tool-text">Redo</span></button></div>
        <div className="pixel-editor__drawing-options"><label>Grid<select value={doc.size} disabled={!!busy} onChange={(event) => { const size = Number(event.target.value) as PixelSize; commit(resizePixels(doc, size)); setCursor((p) => ({ x: Math.min(p.x, size - 1), y: Math.min(p.y, size - 1) })); }} aria-label="Grid size">{PIXEL_SIZES.map((size) => <option key={size} value={size}>{size} × {size}</option>)}</select></label>
          <label>{tool === 'stamp' ? 'Stamp size' : 'Brush'}<select value={tool === 'stamp' ? stampScale : brush} disabled={!!busy || tool === 'fill'} aria-label={tool === 'stamp' ? 'Stamp size' : 'Brush size'} onChange={(e) => tool === 'stamp' ? setStampScale(Number(e.target.value)) : setBrush(Number(e.target.value))}>{(tool === 'stamp' ? [1, 2, 3, 4] : [1, 2, 3, 5]).map((size) => <option key={size} value={size}>{size}{tool === 'stamp' ? '×' : ' px'}</option>)}</select></label>
          <label className="pixel-editor__check"><input type="checkbox" checked={mirror} disabled={!!busy} onChange={(e) => setMirror(e.target.checked)} />Mirror</label><label className="pixel-editor__check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />Grid lines</label>
        </div>
        <div className="pixel-editor__canvas-shell"><div ref={drawing} className="pixel-editor__canvas" role="grid" tabIndex={0} aria-label="Pixel drawing grid" aria-rowcount={doc.size} aria-colcount={doc.size} aria-activedescendant={`${id}-cell`} aria-describedby={`${id}-keys`} onKeyDown={keyboard} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endStroke} onPointerCancel={endStroke} onLostPointerCapture={() => endStroke()}>
          <canvas ref={canvas} width={512} height={512} aria-hidden="true" />
          <span className="pixel-editor__cursor" aria-hidden="true" style={{ left: `${cursor.x / doc.size * 100}%`, top: `${cursor.y / doc.size * 100}%`, width: `${100 / doc.size}%`, height: `${100 / doc.size}%` }} />
          <span className="pixel-editor__sr" role="row" aria-rowindex={cursor.y + 1}><span id={`${id}-cell`} role="gridcell" aria-colindex={cursor.x + 1}>Row {cursor.y + 1}, column {cursor.x + 1}, {doc.pixels[cursor.y * doc.size + cursor.x] ?? 'transparent'}</span></span>
        </div></div>
        <div className="pixel-editor__canvas-meta"><span>{tool === 'stamp' ? `Place ${activeStamp.name.toLowerCase()}` : tool === 'fill' ? 'Fill connected pixels' : tool === 'eraser' ? 'Erase to transparent' : 'Draw on the grid'}{mirror ? ' · mirrored' : ''}</span><span>{cursor.x + 1}, {cursor.y + 1}</span></div>
        <div className="pixel-editor__palette-heading"><label>Palette<select aria-label="Drawing palette" value={palette} onChange={(e) => setPalette(e.target.value as PixelPalette)}><option value="baited">Baited</option><option value="arcade">Arcade</option><option value="ink">Ink</option></select></label><label className="pixel-editor__custom-color">Custom colour<input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={!!busy} /></label></div>
        <div className="pixel-editor__palette" role="group" aria-label="Paint colours">{PIXEL_PALETTES[palette].map((hex) => <button key={hex} type="button" style={{ '--pixel-colour': hex } as React.CSSProperties} disabled={!!busy} aria-label={`Paint ${hex}`} aria-pressed={color.toLowerCase() === hex.toLowerCase()} onClick={() => { setColor(hex); if (tool === 'eraser') setTool('pencil'); }}><span />{color.toLowerCase() === hex.toLowerCase() && <Check size={17} />}</button>)}</div>
        <details className="pixel-editor__keyboard"><summary>Keyboard drawing</summary><p id={`${id}-keys`}>Focus the grid. Arrow keys move one pixel; Shift + arrow moves four. Space or Enter uses the selected tool. Delete erases. Ctrl or ⌘ + Z undoes, with Shift to redo.</p></details>
      </div>
      <aside className="pixel-editor__side">
        <section className="pixel-editor__preview"><div><h3>At card size</h3><span>96 px preview</span></div><div className="pixel-editor__preview-window"><PixelPreview doc={doc} /></div><div className="pixel-editor__mode" role="group" aria-label="Artwork rendering"><button type="button" disabled={!!busy} aria-pressed={doc.renderMode === 'pixels'} onClick={() => commit({ ...doc, renderMode: 'pixels' })}>Pixels</button><button type="button" disabled={!!busy} aria-pressed={doc.renderMode === 'ascii'} onClick={() => commit({ ...doc, renderMode: 'ascii' })}>ASCII</button></div><p>{doc.renderMode === 'ascii' ? 'Characters carry the colours. The exported PNG uses this look.' : 'Check the silhouette here. Small details can disappear on a card.'}</p></section>
        <section className="pixel-editor__parts"><h3>Add a part</h3><p>Pick a shape, then place it on the grid.</p><div>{PIXEL_STAMPS.map((item) => <button key={item.id} type="button" disabled={!!busy} aria-pressed={tool === 'stamp' && stamp === item.id} onClick={() => { setStamp(item.id); setTool('stamp'); }}><svg viewBox="0 0 16 14" aria-hidden="true" shapeRendering="crispEdges">{item.rows.flatMap((row, y) => [...row].flatMap((cell, x) => cell === '.' ? [] : <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={1} height={1} fill={cell === '1' ? '#c9a3ff' : '#fffdf7'} />))}</svg><span>{item.name}</span></button>)}</div></section>
        <details className="pixel-editor__presets"><summary>Start with a drawing</summary><p>Original starter shapes. Change every pixel.</p><div>{(['portrait', 'wizard', 'heart'] as const).map((kind) => <button key={kind} type="button" disabled={!!busy} onClick={() => replace(() => pixelPreset(kind, doc.size), 'Use this starter drawing?', 'It replaces the current grid. Undo can bring your drawing back.')}><PixelPreview doc={pixelPreset(kind, 32)} edge={48} /><span>{kind === 'portrait' ? 'Cap portrait' : kind === 'wizard' ? 'Tall hat' : 'Pixel heart'}</span></button>)}</div></details>
        <details className="pixel-editor__import"><summary>Pixelate an image</summary><p>PNG, JPEG or WebP. Up to 5 MB and 2048 px per side. Images stay on this device until you apply the artwork.</p><label>Conversion palette<select aria-label="Conversion palette" value={convertPalette} disabled={!!busy} onChange={(e) => setConvertPalette(e.target.value as PixelPalette | 'original')}><option value="baited">Baited colours</option><option value="arcade">Arcade colours</option><option value="ink">Ink colours</option><option value="original">Keep image colours</option></select></label><label className="pixel-editor__check"><input type="checkbox" checked={dither} disabled={!!busy || convertPalette === 'original'} onChange={(e) => setDither(e.target.checked)} />Dither between colours</label><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} tabIndex={-1} aria-label="Choose source image" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) confirmImport(file); }} /><Button type="button" className="secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}>Choose image</Button>{imageName && <><small>{imageName}</small><Button type="button" className="text" disabled={!!busy} onClick={() => imageFile.current && confirmImport(imageFile.current)}>Reconvert with these settings</Button></>}</details>
        {doc.renderMode === 'ascii' && <details className="pixel-editor__ascii"><summary>ASCII text</summary><p>The PNG keeps the colours. This text version can be selected and copied.</p><textarea readOnly aria-label="ASCII artwork text" value={ascii} spellCheck={false} /></details>}
      </aside>
    </div>
    <footer className="pixel-editor__footer"><div><p>Use images you have permission to share. Artwork is checked before saving. Download a PNG to keep a local copy.</p><span aria-live="polite">{busy || (dirty ? 'Unapplied changes' : 'Drawing unchanged')}</span></div><div className="pixel-editor__footer-actions"><Button type="button" className="text" disabled={!!busy || !hasPixels(doc)} onClick={() => replace(() => ({ ...newPixelDocument(doc.size), renderMode: doc.renderMode }), 'Clear every pixel?', 'This clears the grid. Undo can restore the drawing.')}><Trash2 size={16} />Clear</Button><Button type="button" className="secondary" disabled={!!busy || !hasPixels(doc)} onClick={() => void download()}>Download PNG</Button><Button type="button" className="secondary" disabled={!!busy} onClick={close}>Cancel</Button><Button type="button" className="primary" disabled={!!busy || !hasPixels(doc)} onClick={() => void apply()}>{busy || 'Use this artwork'} {!busy && <Check size={17} />}</Button></div></footer>
    {pending && <Modal title={pending.title} onClose={() => setPending(null)}><p>{pending.body}</p><div className="modal-actions"><Button type="button" className="secondary" onClick={() => setPending(null)}>Keep drawing</Button><Button type="button" className={pending.label === 'Discard drawing' ? 'danger' : 'primary'} onClick={() => { const action = pending.action; setPending(null); action(); }}>{pending.label}</Button></div></Modal>}
  </section>;
}
