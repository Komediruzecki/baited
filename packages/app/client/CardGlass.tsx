import React, { useId } from 'react';

export type GlassSize = 'xs' | 's' | 'l';

// Opus's Baited values. The tutorial's frequency and final scale were cropped out.
export const glassOptics = {
  xs: { pitch: 9, line: 1.25, scale: 24, frequency: '0.022 0.03', blur: 0.6 },
  s: { pitch: 12, line: 1.5, scale: 40, frequency: '0.012 0.017', blur: 0.9 },
  l: { pitch: 14, line: 1.75, scale: 50, frequency: '0.0095 0.0135', blur: 1.1 },
} as const;

const rules = new Map<number, string>();

// Lines rise toward the card's large corner and cover up to 400 × 760 CSS pixels.
export function glassRules(pitch: number): string {
  if (!Number.isFinite(pitch) || pitch < 1) throw new RangeError('Glass line pitch must be at least one pixel.');
  const cached = rules.get(pitch);
  if (cached !== undefined) return cached;
  const [nx, ny, reach] = [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 1200];
  let path = '';
  for (let step = 0; step * pitch <= nx * 400 + ny * 760; step++) {
    const [x, y] = [nx * step * pitch, ny * step * pitch];
    path += `M${(x - ny * reach).toFixed(2)} ${(y + nx * reach).toFixed(2)}L${(x + ny * reach).toFixed(2)} ${(y - nx * reach).toFixed(2)}`;
  }
  rules.set(pitch, path);
  return path;
}

export function GlassField({ size }: { size: GlassSize }) {
  const optics = glassOptics[size];
  return <svg className="cl-glass-field" aria-hidden="true" focusable="false">
    <path d={glassRules(optics.pitch)} fill="none" stroke="#fffdf7" strokeOpacity={0.22} strokeWidth={optics.line} />
  </svg>;
}

export function GlassLens({ size, bend = true }: { size: GlassSize; bend?: boolean }) {
  const id = `cl-glass-${useId().replace(/[^\w-]/g, '')}`;
  const optics = glassOptics[size];
  return <span className="cl-glass" aria-hidden="true"><svg className="cl-glass__bend" focusable="false">
    <defs>
      <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8c43f9" /><stop offset="1" stopColor="#241050" />
      </linearGradient>
      <filter id={`${id}-bend`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={optics.frequency} numOctaves={1} seed={5} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={optics.scale} xChannelSelector="A" yChannelSelector="A" result="bent" />
        <feGaussianBlur in="bent" stdDeviation={optics.blur} result="frost" />
        <feColorMatrix in="frost" type="saturate" values="1.8" />
      </filter>
    </defs>
    <g filter={bend ? `url(#${id}-bend)` : undefined}>
      <rect width="100%" height="100%" fill={`url(#${id}-light)`} />
      <path d={glassRules(optics.pitch)} fill="none" stroke="#fffdf7" strokeOpacity={0.3} strokeWidth={optics.line} />
    </g>
  </svg></span>;
}
