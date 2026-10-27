import { isCutEdition, type Edition } from './card-lab-model';

// Lab-only materials. Asset URLs come from this catalogue, never saved preferences.
export const finishes = [
  { id: 'stock', name: 'Stock', note: 'The current charcoal face.', source: 'code', asset: null, swatch: null },
  { id: 'dither', name: 'Dither', note: 'Purple and black pixels around the art.', source: 'code', asset: '/card-lab/finishes/dither.svg', swatch: '/card-lab/finishes/dither.svg' },
  { id: 'prism', name: 'Prism', note: 'Shattered holofoil. Catches the light once.', source: 'generated', asset: '/card-lab/finishes/front-prism.webp', swatch: '/card-lab/finishes/front-prism-swatch.webp' },
  { id: 'engraved', name: 'Engraved', note: 'Security print for a secret word.', source: 'generated', asset: '/card-lab/finishes/front-engraved.webp', swatch: '/card-lab/finishes/front-engraved-swatch.webp' },
  { id: 'velvet', name: 'Velvet', note: 'The item on display, in a velvet niche.', source: 'generated', asset: '/card-lab/finishes/front-velvet.webp', swatch: '/card-lab/finishes/front-velvet-swatch.webp' },
  { id: 'spotlight', name: 'Spotlight', note: 'Two-ink poster burst for the big moment.', source: 'generated', asset: '/card-lab/finishes/front-spotlight.webp', swatch: '/card-lab/finishes/front-spotlight-swatch.webp' },
  { id: 'glass', name: 'Glass', note: 'Smoked glass block. The lines behind it bend.', source: 'code', asset: null, swatch: null },
] as const;

export const backs = [
  { id: 'current', name: 'Current', note: "Each edition's existing back.", source: 'code', asset: null, swatch: null, logoByDesign: true },
  { id: 'dither', name: 'Dither', note: 'Purple and black pixels.', source: 'code', asset: '/card-lab/finishes/dither.svg', swatch: '/card-lab/finishes/dither.svg', logoByDesign: true },
  { id: 'mosaic', name: 'Mosaic', note: 'Glazed tiles. Pixels you could touch.', source: 'generated', asset: '/card-lab/backs/back-mosaic.webp', swatch: '/card-lab/backs/back-mosaic-swatch.webp', logoByDesign: true },
  { id: 'prism', name: 'Prism', note: 'Foil lattice, wordmark printed in ink.', source: 'generated', asset: '/card-lab/backs/back-prism.webp', swatch: '/card-lab/backs/back-prism-swatch.webp', logoByDesign: true },
  { id: 'seal', name: 'Seal', note: 'Engraved and unmarked.', source: 'generated', asset: '/card-lab/backs/back-seal.webp', swatch: '/card-lab/backs/back-seal-swatch.webp', logoByDesign: false },
] as const;

export const logoModes = [
  { id: 'designed', name: 'As designed' },
  { id: 'on', name: 'On' },
  { id: 'off', name: 'Off' },
] as const;

export type FinishId = typeof finishes[number]['id'];
export type BackId = typeof backs[number]['id'];
export type LogoMode = typeof logoModes[number]['id'];
export type FinishHost = 'full' | 'slab' | 'own';
export const isFinishId = (value: unknown): value is FinishId => finishes.some(item => item.id === value);
export const isBackId = (value: unknown): value is BackId => backs.some(item => item.id === value);
export const isLogoMode = (value: unknown): value is LogoMode => logoModes.some(item => item.id === value);

export function finishHost(edition: Edition): FinishHost {
  return isCutEdition(edition) ? 'slab' : ['baseline', 'pixel', 'wide'].includes(edition) ? 'own' : 'full';
}

export function backShowsLogo(back: BackId, logo: LogoMode): boolean {
  return logo === 'on' || (logo === 'designed' && backs.find(item => item.id === back)!.logoByDesign);
}
