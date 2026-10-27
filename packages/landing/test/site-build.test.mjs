import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { copyStaticTree, parseEnvironment, prepareStaticSite, publishStaticSite, stageAndPublishSite, withBuildLock } from '../scripts/build-site.mjs'

const buildModule = new URL('../scripts/build-site.mjs', import.meta.url).href

function buildProcess(t, { destination, source, label, hold = false, waitMs = 2_000, abrupt = false }) {
  const code = `
    import assert from 'node:assert/strict';
    import { writeFile, readFile } from 'node:fs/promises';
    import { join } from 'node:path';
    import { withBuildLock, prepareStaticSite } from ${JSON.stringify(buildModule)};
    const [destination, source, label, hold, waitMs, abrupt] = process.argv.slice(1);
    await withBuildLock(destination, async () => {
      await prepareStaticSite({ environment: destination.endsWith('site-dev') ? 'dev' : 'prod', source, destination });
      await writeFile(join(destination, 'owner'), label);
      process.stdout.write('acquired\\n');
      if (abrupt === 'true') process.exit(7);
      if (hold === 'true') await new Promise(resolve => {
        process.stdin.once('data', resolve); process.stdin.once('end', resolve); process.stdin.resume();
      });
      assert.equal(await readFile(join(destination, 'owner'), 'utf8'), label);
    }, { waitMs: Number(waitMs) });
  `
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, destination, source, label, String(hold), String(waitMs), String(abrupt)], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let acquiredResolve
  let acquiredReject
  const acquired = new Promise((resolve, reject) => { acquiredResolve = resolve; acquiredReject = reject })
  // A timed-out waiter is expected in one test, so avoid an unhandled rejection
  // when that test only reads its exit status.
  acquired.catch(() => {})
  child.stdout.on('data', chunk => {
    stdout += chunk
    if (stdout.includes('acquired\n')) acquiredResolve()
  })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => {
      if (!stdout.includes('acquired\n')) acquiredReject(new Error(stderr))
      resolve({ code, stdout, stderr })
    })
  })
  t.after(async () => { child.stdin.end(); await exited })
  return { child, acquired, exited }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'baited-site-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  await mkdir(source)
  for (const [path, content] of [
    ['index.html', 'Landing'], ['terms/index.html', 'Terms'],
    ['cards/proofs/banana.png', 'Shared card art'], ['lab/brand/proof.png', 'Logo study'],
    ['card-lab/assets/lab.js', 'Stale generated lab'], ['.hidden', 'Never copied'],
  ]) {
    const file = join(source, path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content)
  }
  return { root, source }
}

test('build environment is explicit and rejects path-like or unknown inputs', () => {
  assert.equal(parseEnvironment(['--env', 'dev']), 'dev')
  assert.equal(parseEnvironment(['--env', 'prod']), 'prod')
  for (const args of [[], ['dev'], ['--env', '../prod'], ['--env', 'preview'], ['--env', 'dev', '--out', '/tmp']]) {
    assert.throws(() => parseEnvironment(args), /Usage:/)
  }
})

test('production assets exclude all lab trees while preserving shared landing art', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-prod')
  await mkdir(join(destination, 'card-lab'), { recursive: true })
  await writeFile(join(destination, 'card-lab', 'stale.js'), 'Old lab bundle')
  await prepareStaticSite({ environment: 'prod', source, destination })
  assert.deepEqual((await readdir(destination)).sort(), ['cards', 'index.html', 'terms'])
  assert.equal(await readFile(join(destination, 'index.html'), 'utf8'), 'Landing')
  assert.equal(await readFile(join(destination, 'cards/proofs/banana.png'), 'utf8'), 'Shared card art')
})

test('dev preserves logo studies but never reuses a stale standalone gallery', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  await prepareStaticSite({ environment: 'dev', source, destination })
  assert.deepEqual((await readdir(destination)).sort(), ['cards', 'index.html', 'lab', 'terms'])
  assert.equal(await readFile(join(destination, 'lab/brand/proof.png'), 'utf8'), 'Logo study')
})

test('an invalid destination is rejected before existing files are removed', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'keep-me')
  await mkdir(destination)
  await writeFile(join(destination, 'marker'), 'Keep')
  await assert.rejects(prepareStaticSite({ environment: 'prod', source, destination }), /destination must match/)
  await assert.rejects(prepareStaticSite({ environment: '../prod', source, destination: join(root, 'site-prod') }), /destination must match/)
  assert.equal(await readFile(join(destination, 'marker'), 'utf8'), 'Keep')
})

test('lab media copies artwork but leaves prompts, manifests and executable files out', async t => {
  const { root } = await fixture(t)
  const source = join(root, 'media')
  await mkdir(join(source, 'finishes'), { recursive: true })
  await writeFile(join(source, 'finishes', 'foil.webp'), 'Artwork')
  await writeFile(join(source, 'finishes', 'prompts.md'), 'Prompts')
  await writeFile(join(source, 'manifest.json'), '{}')
  await writeFile(join(source, 'script.js'), 'alert(1)')
  const destination = join(root, 'copied')
  await copyStaticTree(source, destination, { mediaOnly: true })
  assert.deepEqual(await readdir(destination), ['finishes'])
  assert.deepEqual(await readdir(join(destination, 'finishes')), ['foil.webp'])
})

test('static copies reject symlinks rather than following files outside the source tree', async t => {
  const { root } = await fixture(t)
  const source = join(root, 'linked')
  await mkdir(source)
  await writeFile(join(root, 'outside.txt'), 'Outside')
  await symlink(join(root, 'outside.txt'), join(source, 'linked.txt'))
  await assert.rejects(copyStaticTree(source, join(root, 'copied')), /symlinks are not allowed/)
})

test('same-environment processes cannot delete another active build and timeout preserves its lock', { timeout: 10_000 }, async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  const owner = buildProcess(t, { destination, source, label: 'first', hold: true })
  await owner.acquired
  const lock = join(root, '.site-dev.build.lock')
  const originalLock = await readFile(lock)
  const waiter = buildProcess(t, { destination, source, label: 'second', waitMs: 100 })
  const blocked = await waiter.exited
  assert.equal(blocked.code, 1)
  assert.match(blocked.stderr, /Timed out waiting 100ms for build lock/)
  assert.equal(await readFile(join(destination, 'owner'), 'utf8'), 'first')
  assert.deepEqual(await readFile(lock), originalLock)
  owner.child.stdin.end()
  assert.equal((await owner.exited).code, 0)
  const retry = buildProcess(t, { destination, source, label: 'second' })
  assert.equal((await retry.exited).code, 0)
  assert.equal(await readFile(join(destination, 'owner'), 'utf8'), 'second')
})

test('a waiting build proceeds after the first releases while prod remains independent', { timeout: 10_000 }, async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  const owner = buildProcess(t, { destination, source, label: 'first', hold: true })
  await owner.acquired
  const waiter = buildProcess(t, { destination, source, label: 'second' })
  const production = buildProcess(t, { destination: join(root, 'site-prod'), source, label: 'production' })
  assert.equal((await production.exited).code, 0)
  assert.equal(await readFile(join(destination, 'owner'), 'utf8'), 'first')
  owner.child.stdin.end()
  assert.equal((await owner.exited).code, 0)
  assert.equal((await waiter.exited).code, 0)
  assert.equal(await readFile(join(destination, 'owner'), 'utf8'), 'second')
})

test('an exited builder leaves no stale ownership and an operation error releases the lock', { timeout: 10_000 }, async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  const owner = buildProcess(t, { destination, source, label: 'exited', abrupt: true })
  assert.equal((await owner.exited).code, 7)
  await assert.rejects(withBuildLock(destination, async () => { throw new Error('Build failed') }), /Build failed/)
  assert.equal(await withBuildLock(destination, async () => 'next build'), 'next build')
})

test('lock paths reject symlinks and invalid waits without touching their target', async t => {
  const { root } = await fixture(t)
  const destination = join(root, 'site-dev')
  const unrelated = join(root, 'unrelated.txt')
  await writeFile(unrelated, 'Keep this file')
  await symlink(unrelated, join(root, '.site-dev.build.lock'))
  await assert.rejects(withBuildLock(destination, async () => assert.fail('must not run')), /regular file/)
  for (const waitMs of [0, Infinity, 180_001]) {
    await assert.rejects(withBuildLock(destination, async () => assert.fail('must not run'), { waitMs }), /valid site build destination/)
  }
  assert.equal(await readFile(unrelated, 'utf8'), 'Keep this file')
})

test('dev publication preserves existing reader paths and publishes each complete document last', { timeout: 10_000 }, async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  await mkdir(join(source, 'card-lab/assets'), { recursive: true })
  // A reader can still be using the old index and chunk while the next build is
  // published. Neither root files nor previous content hashes may disappear.
  await writeFile(join(source, 'index.html'), 'app.js')
  await writeFile(join(source, 'app.js'), 'first')
  await prepareStaticSite({ environment: 'dev', source, destination })
  await mkdir(join(destination, 'card-lab/assets'), { recursive: true })
  await writeFile(join(destination, 'card-lab/assets/old.js'), 'Old chunk')
  const stable = [destination, join(destination, 'index.html'), join(destination, 'app.js'), join(destination, 'cards/proofs/banana.png'), join(destination, 'card-lab/assets/old.js')]
  let reading = true
  let reads = 0
  const errors = []
  const reader = (async () => {
    while (reading) {
      try {
        await Promise.all(stable.map(path => stat(path)))
        const referenced = await readFile(join(destination, 'index.html'), 'utf8')
        await stat(join(destination, referenced))
        reads++
      } catch (error) { errors.push(error) }
      await new Promise(resolve => setImmediate(resolve))
    }
  })()
  try {
    for (let generation = 1; generation <= 3; generation++) {
      await stageAndPublishSite({ environment: 'dev', source, destination, build: async staged => {
        await mkdir(join(staged, 'card-lab/assets'), { recursive: true })
        for (let index = 0; index < 40; index++) {
          await writeFile(join(staged, `card-lab/assets/chunk-${generation}-${index}.js`), `Generation ${generation}`)
        }
        await writeFile(join(staged, 'app.js'), `Generation ${generation}`)
        await writeFile(join(staged, 'index.html'), `card-lab/assets/chunk-${generation}-39.js`)
      } })
    }
  } finally {
    reading = false
    await reader
  }
  assert.ok(reads > 0, 'reader must overlap publication')
  assert.deepEqual(errors, [], 'a live reader must never observe missing or incomplete assets')
  assert.equal(await readFile(join(destination, 'app.js'), 'utf8'), 'Generation 3')
  assert.equal(await readFile(join(destination, 'card-lab/assets/old.js'), 'utf8'), 'Old chunk')
  assert.deepEqual((await readdir(root)).filter(path => path.includes('.stage-')), [])
})

test('a failed staged build leaves the published tree unchanged and removes only its own staging tree', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  await prepareStaticSite({ environment: 'dev', source, destination })
  await writeFile(join(source, 'index.html'), 'Changed source')
  await assert.rejects(stageAndPublishSite({ environment: 'dev', source, destination, build: async () => {
    assert.equal(await readFile(join(destination, 'index.html'), 'utf8'), 'Landing')
    throw new Error('Compilation failed')
  } }), /Compilation failed/)
  assert.equal(await readFile(join(destination, 'index.html'), 'utf8'), 'Landing')
  assert.deepEqual((await readdir(root)).filter(path => path.includes('.stage-')), [])
})

test('production publication replaces stale output without retaining either lab tree', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-prod')
  await mkdir(join(destination, 'card-lab/assets'), { recursive: true })
  await mkdir(join(destination, 'lab/brand'), { recursive: true })
  await writeFile(join(destination, 'card-lab/assets/old.js'), 'Old lab')
  await writeFile(join(destination, 'lab/brand/old.png'), 'Old proof')
  await writeFile(join(destination, 'deleted.js'), 'Deleted source')
  await stageAndPublishSite({ environment: 'prod', source, destination })
  assert.deepEqual((await readdir(destination)).sort(), ['cards', 'index.html', 'terms'])
})

test('unchanged dev assets keep their inode to avoid redundant hot reloads', async t => {
  const { root, source } = await fixture(t)
  const destination = join(root, 'site-dev')
  await prepareStaticSite({ environment: 'dev', source, destination })
  const previous = await stat(join(destination, 'index.html'))
  await stageAndPublishSite({ environment: 'dev', source, destination })
  assert.equal((await stat(join(destination, 'index.html'))).ino, previous.ino)
  await assert.rejects(publishStaticSite({ environment: 'dev', source, destination: source }), /publication destination/)
})
