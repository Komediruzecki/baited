import React, { useEffect, useRef, useState } from 'react';
import { PIXEL_LOGO_COLS, PIXEL_LOGO_ROWS, pixelLogoCells } from '../../landing/site/pixel-logo.js';
import { INK_COLOR, logoPixelDelays, WAVE_TOTAL, waveLift } from '../../landing/site/logo-motion.js';

/** The landing's one-shot pixel wave, scoped to this link and its lifetime. */
export function StudioLogo() {
  const linkRef = useRef<HTMLAnchorElement>(null), glyphRef = useRef<HTMLSpanElement>(null);
  const [delays] = useState(logoPixelDelays);
  useEffect(() => {
    const link = linkRef.current, glyph = glyphRef.current;
    if (!link || !glyph) return;
    const hover = matchMedia('(hover: hover)'), still = matchMedia('(prefers-reduced-motion: reduce)'),
      contrast = matchMedia('(forced-colors: active)');
    let dispose = () => {};
    const sync = () => {
      dispose();
      dispose = () => {};
      if (!hover.matches || still.matches || contrast.matches) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'studio-logo__ink';
      canvas.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cells = pixelLogoCells();
      let start = -Infinity, forward = true, frame = 0;
      const draw = (now: number) => {
        const t = now - start, cell = canvas.width / PIXEL_LOGO_COLS;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = INK_COLOR;
        for (const index of cells) {
          const x = index % PIXEL_LOGO_COLS;
          const y = Math.floor(index / PIXEL_LOGO_COLS) + 1 - waveLift(x, t, forward);
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
        return t < WAVE_TOTAL;
      };
      const tick = (now: number) => { frame = draw(now) ? requestAnimationFrame(tick) : 0; };
      const rest = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        draw(Infinity);
      };
      const wave = (direction: boolean) => {
        if (document.hidden) return;
        cancelAnimationFrame(frame);
        forward = direction;
        start = performance.now();
        frame = requestAnimationFrame(tick);
      };
      const enter = () => wave(true), leave = () => wave(false);
      const visibility = () => { if (document.hidden) rest(); };
      const size = () => {
        const width = glyph.getBoundingClientRect().width;
        if (!width) { link.classList.remove('has-ink'); return; }
        const cell = Math.max(1, Math.round(width / PIXEL_LOGO_COLS * devicePixelRatio));
        canvas.width = PIXEL_LOGO_COLS * cell;
        canvas.height = (PIXEL_LOGO_ROWS + 1) * cell;
        // Preserve the link's exact footprint at fractional mobile/DPR sizes.
        canvas.style.width = `${width}px`;
        canvas.style.height = `${width / PIXEL_LOGO_COLS * (PIXEL_LOGO_ROWS + 1)}px`;
        canvas.style.marginTop = `${-width / PIXEL_LOGO_COLS / 2}px`;
        rest();
        link.classList.add('has-ink');
      };
      glyph.after(canvas);
      const observer = new ResizeObserver(size);
      observer.observe(glyph);
      size();
      link.addEventListener('mouseenter', enter);
      link.addEventListener('mouseleave', leave);
      link.addEventListener('focus', enter);
      link.addEventListener('blur', leave);
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('pagehide', rest);
      dispose = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        link.removeEventListener('mouseenter', enter);
        link.removeEventListener('mouseleave', leave);
        link.removeEventListener('focus', enter);
        link.removeEventListener('blur', leave);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('pagehide', rest);
        link.classList.remove('has-ink');
        canvas.remove();
      };
    };
    sync();
    for (const query of [hover, still, contrast]) query.addEventListener('change', sync);
    return () => {
      dispose();
      for (const query of [hover, still, contrast]) query.removeEventListener('change', sync);
    };
  }, []);
  return <a ref={linkRef} href="https://baited.maff.app" className="brand studio-logo" aria-label="Baited website">
    <span className="product-brand" aria-hidden="true">
      <span className="studio-logo__pixels">{delays.map((delay, index) => <i key={index} style={{ '--d': delay } as React.CSSProperties} />)}</span>
      <span ref={glyphRef} className="baited-glyph" />
    </span>
  </a>;
}
