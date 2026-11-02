import React, { useEffect, useRef } from 'react';

// The glass containers in studio-glass.css. The pointer over one of them moves its rim light.
const GLASS = '.mission-card, .mic-card, .panel, .studio-sound-section, .privacy-panel, .rehearsal-tools, .setup-step';
const GRID = 12, REACH = 180, TRAIL = 700, SPARK = 900, FRAME = 1000 / 30;
const INKS = ['201,168,255', '165,107,255', '145,70,255', '255,252,121'];

type Pixel = { x: number; y: number; size: number; ink: number; alpha: number; rise: number; phase: number; beat: number };
type Block = { x: number; y: number; born: number };

// A fixed value per grid cell, so the lantern's ragged edge stays put while the pointer moves.
const cellNoise = (column: number, row: number) => {
  const n = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Pixels behind the Studio's glass. They rise and twinkle, light up around the pointer and leave
 *  a short trail of blocks, like the landing's cards. Still when motion is reduced, paused while
 *  the tab is hidden, and drawn at 30 fps so it stays light next to a game and OBS. */
export function StudioPixelField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)'), contrast = matchMedia('(forced-colors: active)');
    const pointer = { x: -1e4, y: -1e4 };
    let width = 0, height = 0, ratio = 1, frame = 0, last = -Infinity, lit: HTMLElement | null = null,
      pending: PointerEvent | null = null, pixels: Pixel[] = [], blocks: Block[] = [], sparks: Block[] = [], nextSpark = 0;
    const moving = () => !still.matches && !contrast.matches;

    const seed = () => {
      const count = Math.round(((width * height) / (GRID * GRID)) * (width < 700 ? 0.025 : 0.035));
      pixels = Array.from({ length: count }, () => ({
        x: Math.floor((Math.random() * width) / GRID) * GRID + GRID / 2,
        y: Math.random() * height,
        size: Math.random() < 0.6 ? 3 : Math.random() < 0.75 ? 4 : 6,
        ink: Math.random() < 0.02 ? 3 : Math.floor(Math.random() * 3),
        alpha: 0.14 + Math.random() * 0.36,
        rise: 3 + Math.random() * 9,
        phase: Math.random() * Math.PI * 2,
        beat: 0.4 + Math.random() * 1.2,
      }));
    };
    const draw = (now: number) => {
      const t = now / 1000, live = moving();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (const p of pixels) {
        const y = live ? (((p.y - t * p.rise) % height) + height) % height : p.y;
        const near = live ? Math.max(0, 1 - Math.hypot(p.x - pointer.x, y - pointer.y) / REACH) ** 2 : 0;
        const size = p.size + Math.round(near * 3), glow = live ? 0.65 + 0.35 * Math.sin(t * p.beat + p.phase) : 1;
        ctx.fillStyle = `rgba(${INKS[near > 0.45 && p.ink < 3 ? 0 : p.ink]},${Math.min(1, p.alpha * glow + near * 0.75).toFixed(2)})`;
        ctx.fillRect(Math.round(p.x - size / 2), Math.round(y - size / 2), size, size);
      }
      if (!live) return;
      // The lantern: grid cells around the pointer light up, thinning out to a ragged pixel edge.
      const left = Math.floor((pointer.x - REACH) / GRID), right = Math.floor((pointer.x + REACH) / GRID),
        top = Math.floor((pointer.y - REACH) / GRID), bottom = Math.floor((pointer.y + REACH) / GRID);
      if (pointer.x > -REACH) for (let column = left; column <= right; column++)
        for (let row = top; row <= bottom; row++) {
          const reach = 1 - Math.hypot(column * GRID + GRID / 2 - pointer.x, row * GRID + GRID / 2 - pointer.y) / REACH,
            noise = cellNoise(column, row);
          if (reach <= 0 || noise > reach * 1.35) continue;
          ctx.fillStyle = `rgba(${INKS[noise < 0.08 ? 1 : 0]},${(reach * reach * (0.22 + 0.38 * noise)).toFixed(2)})`;
          ctx.fillRect(column * GRID + 3, row * GRID + 3, GRID - 6, GRID - 6);
        }
      blocks = blocks.filter((b) => now - b.born < TRAIL);
      for (const b of blocks) {
        ctx.fillStyle = `rgba(${INKS[0]},${(0.46 * (1 - (now - b.born) / TRAIL)).toFixed(2)})`;
        ctx.fillRect(b.x + 2, b.y + 2, GRID - 4, GRID - 4);
      }
      // Now and then one cell flashes the card yellow: the one warm point on the violet.
      if (now > nextSpark) {
        sparks.push({ x: Math.floor((Math.random() * width) / GRID) * GRID, y: Math.floor((Math.random() * height) / GRID) * GRID, born: now });
        nextSpark = now + 1400 + Math.random() * 2200;
      }
      sparks = sparks.filter((s) => now - s.born < SPARK);
      for (const s of sparks) {
        const life = (now - s.born) / SPARK;
        ctx.fillStyle = `rgba(${INKS[3]},${(0.7 * Math.sin(Math.PI * life)).toFixed(2)})`;
        ctx.fillRect(s.x + 3, s.y + 3, GRID - 6, GRID - 6);
      }
    };
    const track = (event: PointerEvent) => {
      const panel = event.target instanceof Element ? event.target.closest<HTMLElement>(GLASS) : null;
      if (panel !== lit) {
        lit?.removeAttribute('data-glass-lit');
        lit = panel;
        lit?.setAttribute('data-glass-lit', '');
      }
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      panel.style.setProperty('--glass-x', `${Math.round(event.clientX - box.left)}px`);
      panel.style.setProperty('--glass-y', `${Math.round(event.clientY - box.top)}px`);
    };
    const loop = (now: number) => {
      frame = 0;
      if (pending) track(pending);
      pending = null;
      if (!moving()) return;
      if (now - last >= FRAME) {
        draw(now);
        last = now;
      }
      // While the streamer is in their game, the field holds its last frame.
      if (!document.hidden && document.hasFocus()) frame = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const resize = () => {
      ratio = Math.min(devicePixelRatio || 1, 1.5);
      width = innerWidth;
      height = innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      seed();
      draw(performance.now());
    };
    const move = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pending = event;
      const x = Math.floor(event.clientX / GRID) * GRID, y = Math.floor(event.clientY / GRID) * GRID, end = blocks[blocks.length - 1];
      if (moving() && (!end || end.x !== x || end.y !== y)) blocks.push({ x, y, born: performance.now() });
      if (blocks.length > 48) blocks.shift();
      wake();
    };
    const leave = () => {
      pointer.x = pointer.y = -1e4;
      lit?.removeAttribute('data-glass-lit');
      lit = null;
    };
    const restart = () => {
      draw(performance.now());
      wake();
    };
    resize();
    wake();
    addEventListener('resize', resize);
    addEventListener('focus', wake);
    addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', wake);
    still.addEventListener('change', restart);
    contrast.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
      removeEventListener('focus', wake);
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', wake);
      still.removeEventListener('change', restart);
      contrast.removeEventListener('change', restart);
      leave();
    };
  }, []);
  return <canvas ref={ref} className="studio-pixel-field" aria-hidden="true" />;
}
