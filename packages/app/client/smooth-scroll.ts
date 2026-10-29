import { useEffect } from 'react';
import Lenis from 'lenis';

// The Studio eases the mouse wheel and trackpad as the landing does (packages/landing/site/
// smooth-scroll.js): Lenis 1.3.23 with the owner's reference settings, lerp 0.165 and the wheel × 1.25, with
// touch scrolling left to the device. There is no GSAP here, so Lenis runs on its own frames. Scroll
// areas inside the page (the word list, the artwork grid, the transcript) scroll themselves while
// they can, and dialogs keep the browser's own scrolling. Reduced motion keeps it all native.
// Lenis's stylesheet is imported with the others in main.tsx.
export const LENIS_OPTIONS = { lerp: 0.165, wheelMultiplier: 1.25 } as const;

// While Lenis eases it takes no notice of the page's scroll events, so a scroll from the keyboard,
// focus or a script in that moment would be undone on its next frame: any scroll that is not
// where Lenis left the page takes over at once (as on the landing).
export function yieldToOtherScrolls(lenis: Pick<Lenis, 'isScrolling' | 'animatedScroll' | 'scrollTo'>, y: number): void {
  if (lenis.isScrolling === 'smooth' && Math.abs(y - lenis.animatedScroll) > 2) lenis.scrollTo(y, { immediate: true });
}

export function useSmoothScroll(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({
      ...LENIS_OPTIONS,
      autoRaf: true,
      allowNestedScroll: true,
      prevent: (node) => node.nodeName === 'DIALOG',
    });
    const onScroll = () => yieldToOtherScrolls(lenis, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      lenis.destroy();
    };
  }, []);
}
