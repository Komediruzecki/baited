import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CARD_ART_LIMITS, type CardArtLibraryView } from '../shared/card-art';
import type { PixelDocument } from './pixel-art-model';
import type { PixelArtResult } from './PixelArtEditor';
import { uploadCardArt, listCardArt, deleteCardArt } from './card-art-request';
import { Button, Modal } from './ui';
import { Check, Trash2 } from './icons';
import './card-artwork.css';

const PixelArtEditor = lazy(() => import('./PixelArtEditor'));
export function CardArtwork({ artId, csrf, disabled, onChange, onBusyChange }: {
  artId?: string; csrf: string; disabled: boolean; onChange: (id?: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(false), [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<CardArtLibraryView | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [document, setDocument] = useState<PixelDocument>();
  const [source, setSource] = useState<Blob>();
  const documentArtId = useRef<string | undefined>(undefined);
  const originalApproved = useRef<{ blob: Blob; id: string } | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null), restoreEditorFocus = useRef(false);
  useEffect(() => { onBusyChange(!!busy || editor); return () => onBusyChange(false); }, [busy, editor, onBusyChange]);
  useEffect(() => {
    if (editor || busy || disabled || !restoreEditorFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const trigger = editorTrigger.current;
      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus();
        restoreEditorFocus.current = false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, busy, disabled]);
  useEffect(() => {
    if (documentArtId.current !== artId) {
      setDocument(undefined); setSource(undefined); originalApproved.current = undefined;
      documentArtId.current = artId;
    }
  }, [artId]);
  const feedback = () => { setError(''); setNotice(''); };
  const upload = async (file: File) => {
    setBusy('Fitting and checking image…'); feedback();
    try {
      const result = await uploadCardArt(file, csrf);
      onChange(result.art.id); setDocument(undefined); setSource(undefined);
      setNotice(`Image added at ${result.art.width} × ${result.art.height} px, fitted without cropping. Save the pack to use it.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(''); }
  };
  const openEditor = async () => {
    feedback();
    if (artId && !document) {
      setBusy('Opening image…');
      try {
        const response = await fetch(`/api/studio/card-art/${encodeURIComponent(artId)}.png`, { credentials: 'same-origin', signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error('This image could not be opened. Try again, or remove it to start a drawing.');
        setSource(await response.blob());
      } catch (cause) { setError((cause as Error).message); setBusy(''); return; }
      setBusy('');
    }
    restoreEditorFocus.current = true;
    setEditor(true);
  };
  const applyPixels = async (result: PixelArtResult) => {
    feedback();
    try {
      let sourceId: string | undefined;
      if (result.originalSource) {
        setBusy('Checking original image…');
        if (originalApproved.current?.blob === result.originalSource) sourceId = originalApproved.current.id;
        else {
          const checked = await uploadCardArt(result.originalSource, csrf, 'source', 'upload');
          originalApproved.current = { blob: result.originalSource, id: checked.art.id }; sourceId = checked.art.id;
        }
      }
      setBusy('Checking your card art…');
      const uploaded = await uploadCardArt(result.png, csrf, 'card', result.document.renderMode === 'ascii' ? 'ascii' : result.originalSource ? 'pixel' : 'draw', sourceId);
      documentArtId.current = uploaded.art.id;
      onChange(uploaded.art.id); setDocument(result.document); setSource(result.originalSource); setEditor(false);
      setNotice('Artwork added to this edit. Save the pack to use it.');
    } finally { setBusy(''); }
  };
  const showLibrary = async () => {
    setBusy('Opening image library…'); feedback();
    try { setLibrary(await listCardArt()); setLibraryOpen(true); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(''); }
  };
  return <section className="card-artwork" aria-label="Card artwork">
    <div className="card-maker__subheading"><h3>Card artwork</h3><span>Optional</span></div>
    <p className="card-maker__hint">Upload your own image or draw it, pixel by pixel. Without one, the card uses Baited art or the word itself.</p>
    {artId && <div className="card-artwork__current"><img src={`/api/studio/card-art/${encodeURIComponent(artId)}.png`} alt="Your card illustration" width={72} height={72} /><span><Check size={16} />Custom image selected</span><Button type="button" className="text" disabled={disabled || !!busy || editor} onClick={() => { onChange(undefined); setDocument(undefined); setSource(undefined); setNotice('Image removed from this edit. Save the pack to keep this change.'); }}>Remove from card</Button></div>}
    <div className="card-artwork__actions">
      <Button type="button" className="secondary" disabled={disabled || !!busy || editor} onClick={() => input.current?.click()}>Upload image</Button>
      <Button type="button" className="secondary" disabled={disabled || !!busy || editor} onClick={(event) => { editorTrigger.current = event.currentTarget; void openEditor(); }}>{artId ? 'Edit as pixel art' : 'Draw pixel art'}</Button>
      <Button type="button" className="text" disabled={disabled || !!busy || editor} onClick={() => void showLibrary()}>Saved images</Button>
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Upload card image" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
    <p className="card-maker__hint">Large photos are resized to fit the card. Nothing is cropped or stretched.</p>
    <p className="card-artwork__policy">PNG, JPEG or WebP. Up to 5 MB, {CARD_ART_LIMITS.inputEdge} px per side and {CARD_ART_LIMITS.inputPixels / 1_000_000} megapixels. Use images you have permission to share. Sexual imagery is not allowed; images are checked before saving. Checks can miss content or reject a harmless image.</p>
    {!!busy && <p role="status" className="card-artwork__status">{busy}</p>}
    {!!error && <p role="alert" className="card-maker__field-error">{error}</p>}
    {!!notice && <p role="status" className="card-artwork__status">{notice}</p>}
    {editor && <Suspense fallback={<p role="status">Opening pixel editor…</p>}><PixelArtEditor initialDocument={document} initialSource={source} onApply={applyPixels} onClose={() => { if (!busy) setEditor(false); }} /></Suspense>}
    {libraryOpen && <Modal title="Your saved images" onClose={() => { if (!busy) { setLibraryOpen(false); setRemoving(null); } }}>
      <div className="card-artwork__library">
        <p>Choose an image for this card. A source is the original used to make pixel or ASCII art.</p>
        <small>{library?.art.length ?? 0}/{CARD_ART_LIMITS.assets} images · {((library?.bytes ?? 0) / 1024 / 1024).toFixed(1)} MB of 100 MB</small>
        {!library?.art.length && <p>No saved images yet. Upload one or draw your first card.</p>}
        <div className="card-artwork__grid">{library?.art.map((item, index) => <div key={item.id}>
          <button type="button" className="card-artwork__tile" disabled={!!busy || item.purpose === 'source'} aria-pressed={artId === item.id} aria-label={`Use image ${index + 1}`} onClick={() => { onChange(item.id); setDocument(undefined); setSource(undefined); setLibraryOpen(false); setNotice('Image selected. Save the pack to use it.'); }}><img src={item.url} alt={`Saved ${item.source} ${item.purpose === 'source' ? 'source' : 'artwork'} ${index + 1}`} loading="lazy" width={96} height={96} /><span>{item.purpose === 'source' ? 'Source' : item.source === 'draw' ? 'Drawing' : item.source === 'ascii' ? 'ASCII' : item.source === 'pixel' ? 'Pixel art' : 'Image'}</span></button>
          <Button type="button" className="text" disabled={!!busy || item.id === artId} aria-label={`Delete image ${index + 1}`} onClick={() => setRemoving(item.id)}><Trash2 size={14} />Delete</Button>
        </div>)}</div>
        {removing && <div className="card-artwork__delete"><p>Delete this saved image? Images used by packs, past rounds or other artwork will be kept.</p><div className="card-artwork__actions"><Button type="button" className="secondary" disabled={!!busy} onClick={() => setRemoving(null)}>Keep image</Button><Button type="button" className="danger" disabled={!!busy} onClick={async () => { setBusy('Deleting image…'); setError(''); try { setLibrary(await deleteCardArt(removing, csrf)); if (originalApproved.current?.id === removing) originalApproved.current = undefined; setRemoving(null); } catch (cause) { setError((cause as Error).message); } finally { setBusy(''); } }}>Delete image</Button></div></div>}
        {busy && <p role="status">{busy}</p>}{error && <p role="alert" className="card-maker__field-error">{error}</p>}
      </div>
    </Modal>}
  </section>;
}
