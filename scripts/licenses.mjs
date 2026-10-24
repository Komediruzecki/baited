import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve('.'),
  pnpm = join(root, 'node_modules/.pnpm'),
  seen = new Set(),
  inventory = [];
const lock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8');
for (const entry of await readdir(pnpm, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const modules = join(pnpm, entry.name, 'node_modules');
  let names;
  try {
    names = await readdir(modules);
  } catch {
    continue;
  }
  for (const name of names) {
    const candidates = name.startsWith('@')
      ? (await readdir(join(modules, name))).map((n) => join(name, n))
      : [name];
    for (const candidate of candidates) {
      const directory = join(modules, candidate);
      let pkg;
      try {
        pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      } catch {
        continue;
      }
      const id = `${pkg.name}@${pkg.version}`;
      // pnpm can leave obsolete package folders after upgrades. Only ship resolved versions.
      if (!lock.includes(`  ${id}:`) && !lock.includes(`  '${id}':`)) continue;
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
  }
}
inventory.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(join(root, 'licenses'), { recursive: true });
await writeFile(
  join(root, 'licenses/dependencies.json'),
  JSON.stringify(inventory, null, 2) + '\n',
);
await writeFile(
  join(root, 'THIRD_PARTY_NOTICES.md'),
  '# Third-party notices\n\nOriginal BAIT code, SVG illustration and sound are MIT licensed. The project owner supplied `public/brand/baitlogo.png`; the original is retained, a transparent derivative is used in the UI, and both are documented separately in `public/brand/README.md`. The following dependencies retain their own licenses. Full texts found in installed packages are copied into `licenses/dependencies/`; `licenses/dependencies.json` records exact versions. Build and test tools are included in this inventory.\n\nThe interface uses Inter and Inter Tight from Google Fonts under SIL Open Font License 1.1. Earlier unused Barlow Condensed, DM Sans and Space Grotesk font files are retained with their licenses. Full copyright and license notices are in `licenses/fonts/`. Font files are unmodified.\n\nGoogle Material Icons Outlined are bundled as SVG components under Apache 2.0. The full license is in `licenses/material-icons/LICENSE`. Twitch and Deepgram are external services, subject to their own terms; neither service’s proprietary code is included.\n\n| Package | Version | License |\n| --- | --- | --- |\n' +
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
