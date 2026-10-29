import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  workspace = resolve(root, '../..'),
  seen = new Set(),
  inventory = [];
// Query this package's installed graph, not the shared virtual-store directory:
// the latter also contains landing-only and obsolete dependency versions.
const listed = spawnSync('pnpm', ['--filter', '@baited/app', 'list', '--depth', 'Infinity', '--json'], {
  cwd: workspace,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (listed.error || listed.status !== 0) {
  throw new Error('Install the workspace dependencies before generating application licenses.');
}
const projects = JSON.parse(listed.stdout);
if (projects.length !== 1 || projects[0].name !== '@baited/app') {
  throw new Error('Expected exactly one installed @baited/app dependency graph.');
}
const installed = new Set();
function collect(project) {
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const dependency of Object.values(project[group] || {})) {
      if (dependency.path) installed.add(dependency.path);
      // Repeated nodes can carry children omitted from an earlier occurrence.
      // The JSON tree is finite, so traverse children before deduplicating files.
      collect(dependency);
    }
  }
}
collect(projects[0]);
if (installed.size === 0) throw new Error('No installed application dependencies were found.');
for (const directory of installed) {
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    // pnpm also lists optional binaries for platforms absent from this install.
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const destination = join(root, 'licenses/dependencies', id.replaceAll('/', '__'));
  const files = (await readdir(directory)).filter((n) =>
    /^(licen[sc]e|copying|notice|copyright)(\.|$|-)/i.test(n),
  );
  const saved = [];
  for (const file of files) {
    try {
      const text = await readFile(join(directory, file), 'utf8');
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, file), text);
      saved.push(file);
    } catch {}
  }
  inventory.push({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license || pkg.licenses || 'SEE PACKAGE',
    repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
    licenseFiles: saved,
  });
}
inventory.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(join(root, 'licenses'), { recursive: true });
await writeFile(
  join(root, 'licenses/dependencies.json'),
  JSON.stringify(inventory, null, 2) + '\n',
);
await writeFile(
  join(root, 'THIRD_PARTY_NOTICES.md'),
  '# Third-party notices\n\nOriginal BAIT code and SVG illustration are MIT licensed. Sound Lab engine modules and recipes are adapted from Keys in disjoint-colliders (MIT, copyright2025 Dnzzk2). The full notice, pinned source revision and adaptations are documented in `client/sound-lab/PROVENANCE.md` and its bundled legal notice. The card illustrations were generated with an AI image model; batch manifests, prompts and source hashes are documented in `public/cards/proofs/README.md`. Moonshine WASM and the pinned English model use their upstream MIT license; see `licenses/moonshine/` and `docs/moonshine.md`. The project owner supplied `public/brand/baitlogo.png`; the original is retained, a transparent derivative is used in the UI, and both are documented separately in `public/brand/README.md`. The following dependencies retain their own licenses. Full texts found in installed packages are copied into `licenses/dependencies/`; `licenses/dependencies.json` records exact versions. Build and test tools are included in this inventory.\n\nThe interface uses Russo One, Inter and Inter Tight from Google Fonts under SIL Open Font License 1.1. Earlier unused Barlow Condensed, DM Sans and Space Grotesk font files are retained with their licenses. Full copyright and license notices are in `licenses/fonts/`. Font files are unmodified.\n\nGoogle Material Icons Outlined are bundled as SVG components under Apache 2.0. The full license is in `licenses/material-icons/LICENSE`. The artwork scanner bundles NSFWJS and its MobileNetV2Mid model under the package’s MIT license; pinned model provenance is in `docs/card-art-moderation.md` and its license is in `licenses/nsfw-model/`. TensorFlow.js retains Apache 2.0 and Layers MIT/Apache notices in `licenses/tensorflow/`; seedrandom notices are in `licenses/seedrandom/`. Sharp uses Apache 2.0; its bundled native libraries have separate licenses. The native version inventories, available full texts and remaining distribution-notice gap are documented in `licenses/libvips/README.md`. Supplemental notice source hashes are in `licenses/packaging-notice-provenance.json`. Original pixel-editor stamps and presets are project code. Twitch and the optional legacy Deepgram adapter are external services, subject to their own terms; neither service’s proprietary code is included.\n\n| Package | Version | License |\n| --- | --- | --- |\n' +
    inventory
      .map(
        (p) =>
          `| ${p.name} | ${p.version} | ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)} |`,
      )
      .join('\n') +
    '\n',
);
console.log(
  `Recorded ${inventory.length} dependencies and copied their available full license texts.`,
);
