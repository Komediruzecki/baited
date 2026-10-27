import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GlassField,
  GlassLens,
  glassOptics,
  glassRules,
  type GlassSize,
} from '../client/CardGlass';

interface Element {
  name: string;
  attrs: Record<string, string>;
  children: Element[];
  text: string;
}

// The renderer emits a small, closed SVG vocabulary. Parse its structure so the
// assertions do not depend on attribute order or the serializer's whitespace.
function parseMarkup(markup: string): Element {
  const root: Element = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  for (const token of markup.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (!token.startsWith('<')) {
      stack.at(-1)!.text += token;
      continue;
    }
    const closing = /^<\/([^\s>]+)>$/.exec(token);
    if (closing) {
      assert.equal(stack.pop()?.name, closing[1], 'balanced markup');
      continue;
    }
    const opening = /^<([^\s/>]+)([\s\S]*?)\/?\s*>$/.exec(token);
    assert.ok(opening, `unexpected markup token: ${token}`);
    const attrs: Record<string, string> = {};
    const remaining = opening[2].replace(/([\w:-]+)="([^"]*)"/g, (_, name, value) => {
      assert.equal(Object.hasOwn(attrs, name), false, `duplicate attribute ${name}`);
      attrs[name] = value;
      return '';
    });
    assert.equal(remaining.trim(), '', 'all attributes are explicit quoted values');
    const node: Element = { name: opening[1], attrs, children: [], text: '' };
    stack.at(-1)!.children.push(node);
    if (!token.endsWith('/>')) stack.push(node);
  }
  assert.equal(stack.length, 1, 'all elements close');
  return root;
}

function descendants(node: Element): Element[] {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function named(node: Element, name: string): Element[] {
  return descendants(node).filter(child => child.name === name);
}

function lens(size: GlassSize, bend?: boolean, identifierPrefix = 'glass-test-'): string {
  return renderToStaticMarkup(React.createElement(GlassLens, { size, bend }), { identifierPrefix });
}

function lenses(sizes: GlassSize[], identifierPrefix: string): string {
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null,
      ...sizes.map((size, index) => React.createElement(GlassLens, { key: index, size }))),
    { identifierPrefix },
  );
}

function assertLocalReferences(svg: Element): void {
  const nodes = [svg, ...descendants(svg)];
  const ids = nodes.flatMap(node => node.attrs.id ? [node.attrs.id] : []);
  const targets = new Map(nodes.filter(node => node.attrs.id).map(node => [node.attrs.id, node]));
  assert.equal(new Set(ids).size, ids.length, 'IDs inside each SVG are unique');
  const references: string[] = [];
  for (const node of nodes) {
    for (const [attribute, value] of Object.entries(node.attrs)) {
      if (value.includes('url(')) {
        const reference = /^url\(#([\w-]+)\)$/.exec(value);
        assert.ok(reference, 'resource references must be local fragments');
        assert.ok(ids.includes(reference[1]), `${reference[1]} resolves inside its own SVG`);
        assert.equal(targets.get(reference[1])?.name, attribute === 'filter' ? 'filter' : 'linearGradient',
          `${attribute} resolves to the correct kind of local definition`);
        references.push(reference[1]);
      }
    }
  }
  assert.equal(references.length, 2, 'the bend and light each have a local reference');
}

const sizes: GlassSize[] = ['xs', 's', 'l'];

test('64 sibling glass lenses keep every filter and gradient local to its own SVG', () => {
  const tree = parseMarkup(lenses(Array.from({ length: 64 }, (_, index) => sizes[index % sizes.length]), 'siblings-'));
  const svgs = named(tree, 'svg');
  assert.equal(svgs.length, 64);
  const ids = descendants(tree).flatMap(node => node.attrs.id ? [node.attrs.id] : []);
  assert.equal(ids.length, 128);
  assert.equal(new Set(ids).size, ids.length, 'no sibling can borrow another lens’s filter');
  for (const id of ids) assert.match(id, /^cl-glass-[\w-]+-(?:bend|light)$/);
  for (const svg of svgs) assertLocalReferences(svg);
});

test('glass SSR is deterministic and independent roots can use disjoint identifier prefixes', () => {
  const treeSizes: GlassSize[] = ['xs', 's', 'l', 's'];
  const first = lenses(treeSizes, 'root-a-');
  assert.equal(lenses(treeSizes, 'root-a-'), first);
  const second = lenses(treeSizes, 'root-b-');
  const firstIds = new Set(descendants(parseMarkup(first)).flatMap(node => node.attrs.id ? [node.attrs.id] : []));
  const secondTree = parseMarkup(second);
  const secondIds = descendants(secondTree).flatMap(node => node.attrs.id ? [node.attrs.id] : []);
  assert.equal(secondIds.length, firstIds.size);
  assert.ok(secondIds.every(id => !firstIds.has(id)), 'separate roots cannot cross-reference one another');
  for (const svg of named(secondTree, 'svg')) assertLocalReferences(svg);
  for (const id of descendants(parseMarkup(lens('s', true, 'root:punctuation/'))).flatMap(node => node.attrs.id ? [node.attrs.id] : [])) {
    assert.match(id, /^cl-glass-[\w-]+-(?:bend|light)$/, 'React punctuation is safe in local URL IDs');
  }
});

test('every size applies its optics only to the decorative scene, never to the field', () => {
  for (const size of sizes) {
    const optics = glassOptics[size];
    const tree = parseMarkup(lens(size));
    const filter = named(tree, 'filter');
    assert.equal(filter.length, 1);
    assert.equal(filter[0].attrs['color-interpolation-filters'], 'sRGB');
    assert.deepEqual(filter[0].children.map(node => node.name), [
      'feTurbulence', 'feDisplacementMap', 'feGaussianBlur', 'feColorMatrix',
    ]);
    const [noise, displacement, blur, saturation] = filter[0].children;
    assert.equal(noise.attrs.type, 'fractalNoise');
    assert.equal(noise.attrs.baseFrequency, optics.frequency);
    assert.equal(noise.attrs.numOctaves, '1');
    assert.equal(noise.attrs.seed, '5');
    assert.equal(displacement.attrs.in, 'SourceGraphic');
    assert.equal(displacement.attrs.in2, noise.attrs.result);
    assert.equal(displacement.attrs.scale, String(optics.scale));
    assert.equal(displacement.attrs.xChannelSelector, 'A');
    assert.equal(displacement.attrs.yChannelSelector, 'A');
    assert.equal(blur.attrs.in, displacement.attrs.result);
    assert.equal(blur.attrs.stdDeviation, String(optics.blur));
    assert.equal(saturation.attrs.in, blur.attrs.result);
    assert.equal(saturation.attrs.type, 'saturate');
    assert.equal(saturation.attrs.values, '1.8');

    const filtered = descendants(tree).filter(node => Object.hasOwn(node.attrs, 'filter'));
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'g');
    assert.deepEqual(filtered[0].children.map(node => node.name), ['rect', 'path']);
    assert.equal(filtered[0].children[1].attrs.d, glassRules(optics.pitch));
    assert.equal(filtered[0].children[1].attrs['stroke-width'], String(optics.line));

    const field = parseMarkup(renderToStaticMarkup(React.createElement(GlassField, { size })));
    assert.equal(descendants(field).some(node => Object.hasOwn(node.attrs, 'filter')), false);
    assert.equal(named(field, 'filter').length, 0);
    assert.equal(named(field, 'path')[0].attrs.d, glassRules(optics.pitch));
    assert.equal(named(field, 'path')[0].attrs['stroke-width'], String(optics.line));
  }
});

test('turning the bend off preserves the same SVG scene and order, removing only its filter attribute', () => {
  for (const size of sizes) {
    assert.equal(lens(size), lens(size, true), 'bending is enabled by default');
    const bent = parseMarkup(lens(size, true));
    const straight = parseMarkup(lens(size, false));
    const filtered = descendants(bent).filter(node => Object.hasOwn(node.attrs, 'filter'));
    assert.equal(filtered.length, 1);
    delete filtered[0].attrs.filter;
    assert.equal(descendants(straight).some(node => Object.hasOwn(node.attrs, 'filter')), false);
    assert.deepEqual(straight, bent, 'fallback keeps definitions, drawing, IDs and paint order intact');
  }
});

test('glass markup is decorative geometry without executable content, text or external resources', () => {
  const allowed = new Set([
    'span', 'svg', 'defs', 'linearGradient', 'stop', 'filter', 'feTurbulence',
    'feDisplacementMap', 'feGaussianBlur', 'feColorMatrix', 'g', 'rect', 'path',
  ]);
  for (const size of sizes) {
    for (const markup of [lens(size), renderToStaticMarkup(React.createElement(GlassField, { size }))]) {
      const tree = parseMarkup(markup);
      assert.equal(tree.children[0].attrs['aria-hidden'], 'true');
      for (const node of descendants(tree)) {
        assert.ok(allowed.has(node.name), `unexpected node ${node.name}`);
        assert.equal(node.text.trim(), '', 'the shader cannot contain words or text nodes');
        for (const [name, value] of Object.entries(node.attrs)) {
          assert.doesNotMatch(name, /^(?:on|style$|href$|xlink:href$|src$)/i);
          assert.doesNotMatch(value, /(?:https?:|data:|javascript:|\/\/)/i);
        }
      }
      for (const svg of named(tree, 'svg')) assert.equal(svg.attrs.focusable, 'false');
    }
  }
});

test('ruled geometry is deterministic, finite and bounded for every published pitch', () => {
  const lineCounts: number[] = [];
  for (const size of sizes) {
    const { pitch } = glassOptics[size];
    const path = glassRules(pitch);
    assert.equal(glassRules(pitch), path);
    const segments = [...path.matchAll(/M(-?[\d.]+)\s+(-?[\d.]+)L(-?[\d.]+)\s+(-?[\d.]+)/g)];
    assert.ok(segments.length > 0 && segments.length < 1000, 'the scene has a bounded set of straight rules');
    assert.equal(segments.map(segment => segment[0]).join(''), path, 'all geometry is made of line segments');
    for (const segment of segments) {
      const [x1, y1, x2, y2] = segment.slice(1).map(Number);
      assert.ok([x1, y1, x2, y2].every(Number.isFinite));
      assert.ok(x2 > x1 && y2 < y1, 'rules rise toward the right');
    }
    lineCounts.push(segments.length);
  }
  assert.ok(lineCounts[0] > lineCounts[1] && lineCounts[1] > lineCounts[2], 'larger pitch yields fewer rules');
  for (const pitch of [0, -1, 0.1, NaN, Infinity, -Infinity]) {
    assert.throws(() => glassRules(pitch), RangeError, `invalid pitch ${pitch} must fail safely`);
  }
});
