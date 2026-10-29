import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LENIS_OPTIONS, yieldToOtherScrolls } from '../client/smooth-scroll';

// The landing's smooth scrolling (packages/landing/site/smooth-scroll.js) sets the feel: the Studio
// eases the wheel with the same Lenis settings.
test('the Studio eases the wheel exactly as the landing does', () => {
  const landing = readFileSync(new URL('../../landing/site/smooth-scroll.js', import.meta.url), 'utf8');
  const options = landing.match(/export const LENIS_OPTIONS = Object\.freeze\(\{ lerp: ([\d.]+), wheelMultiplier: ([\d.]+) \}\)/);
  assert.ok(options, 'the landing states its Lenis settings');
  assert.deepEqual({ ...LENIS_OPTIONS }, { lerp: Number(options[1]), wheelMultiplier: Number(options[2]) });
  assert.deepEqual({ ...LENIS_OPTIONS }, { lerp: 0.165, wheelMultiplier: 1.25 });
});

test('a scroll Lenis did not make takes over from its easing at once', () => {
  const calls: [number, unknown][] = [];
  const lenis = (isScrolling: false | 'native' | 'smooth', animatedScroll: number) => ({
    isScrolling,
    animatedScroll,
    scrollTo: (y: unknown, options?: unknown) => void calls.push([y as number, options]),
  });
  yieldToOtherScrolls(lenis('smooth', 640.4), 641);
  yieldToOtherScrolls(lenis('smooth', 640.4), 90);
  yieldToOtherScrolls(lenis(false, 640), 90);
  yieldToOtherScrolls(lenis('native', 640), 90);
  assert.deepEqual(calls, [[90, { immediate: true }]]);
});
