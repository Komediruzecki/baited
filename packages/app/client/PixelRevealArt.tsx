import React, { useEffect, useRef, useState } from 'react';
import { CardArt } from './CardArt';

// A short, local artwork treatment. The exact word and rules never go through
// this canvas, and the original image stays the fallback when drawing fails.
export function PixelRevealArt({ word, disabled }: { word: string; disabled: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setResolving(false);
    const image = root.current?.querySelector('img');
    const surface = canvas.current;
    if (!image || !surface) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let disposed = false;
    let played = false;
    let visible = false;
    const finish = () => {
      cancelAnimationFrame(frame);
      if (!disposed) setResolving(false);
    };
    const begin = () => {
      if (played || !visible || disabled || reduced.matches || document.hidden || !image.complete || !image.naturalWidth) return;
      const drawing = surface.getContext('2d');
      if (!drawing) return;
      played = true;
      const steps = [8, 12, 20, 32, 56, 96, 160];
      let lastStep = -1;
      const paint = (index: number) => {
        if (index === lastStep) return;
        lastStep = index;
        surface.width = steps[index];
        surface.height = Math.max(1, Math.round(steps[index] * image.naturalHeight / image.naturalWidth));
        drawing.imageSmoothingEnabled = false;
        drawing.clearRect(0, 0, surface.width, surface.height);
        drawing.drawImage(image, 0, 0, surface.width, surface.height);
      };
      try { paint(0); } catch { return; }
      setResolving(true);
      let started: number | null = null;
      const tick = (now: number) => {
        if (disposed) return;
        if (reduced.matches || document.hidden || !visible) { finish(); return; }
        // Start timing at the first animation frame, after scheduling delays.
        if (started === null) started = now;
        const elapsed = now - started;
        try { paint(Math.min(steps.length - 1, Math.floor(elapsed / 90))); } catch { finish(); return; }
        if (elapsed >= 630) { finish(); return; }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) begin(); else finish();
    });
    observer.observe(surface);
    const stopWhenHidden = () => { if (document.hidden) finish(); };
    image.addEventListener('load', begin);
    reduced.addEventListener('change', finish);
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      image.removeEventListener('load', begin);
      reduced.removeEventListener('change', finish);
      document.removeEventListener('visibilitychange', stopWhenHidden);
    };
  }, [word, disabled]);

  return <span className="cl-pixel-art" ref={root} data-resolving={resolving} aria-hidden="true">
    <CardArt word={word} />
    <canvas ref={canvas} className="cl-pixel-art__canvas" />
  </span>;
}
