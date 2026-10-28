import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Format exports of the approved identity, not another generated logo variant.
// Requires librsvg's rsvg-convert. Keep the original identity and earlier
// listing exports intact; this script only writes the selected listing folder.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { version: '0.0.3', outDir: undefined };
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--help') {
    console.log('Usage: node scripts/build-twitch-brand-assets.mjs [--version SEMVER] [--out-dir PATH]');
    process.exit(0);
  }
  if (flag !== '--version' && flag !== '--out-dir') throw new Error(`Unknown option: ${flag}`);
  const value = process.argv[++index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  options[flag === '--version' ? 'version' : 'outDir'] = value;
}
if (!/^\d+\.\d+\.\d+$/.test(options.version)) throw new Error('Use a three-part Extension version, for example 0.0.3.');
const out = resolve(options.outDir ?? resolve(app, `assets/twitch/v${options.version}`));
const archive = resolve(app, 'assets/twitch/v0.0.1');
const archiveRelative = relative(archive, out);
if (!archiveRelative || (!archiveRelative.startsWith('..') && !archiveRelative.startsWith('/'))) {
  throw new Error('The v0.0.1 listing exports are archived. Choose a new version or another output folder.');
}
const source = resolve(app, '../landing/site/assets/brand/baited-pixel-white.svg');
const iconSource = resolve(app, '../landing/site/assets/brand/baited-favicon.svg');
const mask = await readFile(source);
const favicon = await readFile(iconSource);
const mark = `data:image/svg+xml;base64,${mask.toString('base64')}`;
const faviconImage = `data:image/svg+xml;base64,${favicon.toString('base64')}`;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const ink = '#FFFC79', purple = '#9146FF', dark = '#21172F';

function wordmark(x, y, width, color = ink, id = 'wordmark') {
  const height = width * 10 / 37;
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" style="mask-type:alpha"><image x="${x}" y="${y}" width="${width}" height="${height}" href="${mark}"/></mask><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" mask="url(#${id})"/>`;
}
function svg(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title>${body}</svg>\n`;
}
function card(x, y, angle, color, id) {
  return `<g transform="translate(${x} ${y}) rotate(${angle} 38 105)"><rect width="76" height="108" rx="6" fill="${color}" stroke="#B89BE3" stroke-width="1"/><rect x="5" y="5" width="66" height="98" rx="3" fill="none" stroke="#B89BE3" stroke-opacity=".35"/>${wordmark(9, 43, 58, '#E7DDF7', id)}</g>`;
}
const logo = svg(100, 100, 'Baited Extension logo', `<rect width="100" height="100" fill="${purple}"/><g transform="rotate(-8 50 50)"><rect x="24" y="15" width="52" height="70" rx="4" fill="${dark}" stroke="#B99AE8"/><rect x="29" y="20" width="42" height="60" rx="2" fill="none" stroke="#B99AE8" stroke-opacity=".35"/></g>${wordmark(6, 37, 88)}`);
const icon = svg(24, 24, 'Baited B icon', `<image width="24" height="24" href="${faviconImage}"/>`);
const discovery = svg(300, 200, 'Baited card game for Twitch chat', `<rect width="300" height="200" fill="${purple}"/><path d="M0 155 L300 105 V200 H0Z" fill="#7C33E4"/>${card(96, 70, -23, '#342048', 'back-left')}${card(113, 70, -6, '#21172F', 'back-middle')}${card(130, 70, 13, '#2A193E', 'back-right')}${wordmark(21, 16, 258, ink, 'headline')}`);

await mkdir(out, { recursive: true });
const assets = [];
for (const [name, width, height, content, purpose] of [
  ['logo-100', 100, 100, logo, 'Twitch Extension logo'],
  ['icon-24', 24, 24, icon, 'Optional video-component taskbar icon; not required by the panel'],
  ['discovery-300x200', 300, 200, discovery, 'Twitch discovery image'],
]) {
  const svgPath = resolve(out, `${name}.svg`);
  const pngPath = resolve(out, `${name}.png`);
  await writeFile(svgPath, content);
  const render = spawnSync('rsvg-convert', ['--width', String(width), '--height', String(height), '--output', pngPath, svgPath], { encoding: 'utf8' });
  if (render.status !== 0) throw new Error(`Cannot export ${name}: install librsvg (rsvg-convert).`);
  const png = await readFile(pngPath);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error(`Invalid ${name} PNG export.`);
  assets.push({ file: `${name}.png`, source: `${name}.svg`, width, height, bytes: png.length, sha256: hash(png), purpose });
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify({
  extensionVersion: options.version, category: 'Games in Extensions',
  identity: 'Approved landing pixel BAITED lettering and pixel B favicon, without an added hook',
  source: 'packages/landing/site/assets/brand/baited-pixel-white.svg',
  sourceSha256: hash(mask),
  iconSource: 'packages/landing/site/assets/brand/baited-favicon.svg',
  iconSourceSha256: hash(favicon), renderer: 'librsvg rsvg-convert',
  licensing: 'Project identity supplied by the owner. No Twitch marks or third-party game marks used. Existing A/B/C explorations preserved.',
  screenshots: 'Capture the actual running panel and studio. No staged landing film or generated interface is included as a screenshot.',
  assets,
}, null, 2) + '\n');
console.log(`Exported ${assets.length} Twitch brand assets to ${out}`);
