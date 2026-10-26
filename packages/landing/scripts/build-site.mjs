import { spawn, spawnSync } from 'node:child_process'
import { copyFile, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const landingRoot = fileURLToPath(new URL('..', import.meta.url))
const appRoot = resolve(landingRoot, '../app')
const labMediaExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])

export async function withBuildLock(destination, operation, { waitMs = 180_000 } = {}) {
  if (!/^site-(?:dev|prod)$/.test(basename(destination)) || !Number.isFinite(waitMs) || waitMs < 1 || waitMs > 180_000) {
    throw new Error('A valid site build destination and lock wait are required')
  }
  await mkdir(dirname(destination), { recursive: true })
  const lockPath = join(dirname(destination), `.${basename(destination)}.build.lock`)
  const existing = await lstat(lockPath).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing && !existing.isFile()) throw new Error(`Build lock must be a regular file: ${lockPath}`)

  // Linux flock provides kernel-owned cross-process locks. The file is retained:
  // no age/PID guesses or stale-lock deletion can remove another build's lock.
  // EOF releases the holder if this process exits, including abnormal exits.
  const holder = spawn('flock', [
    '--exclusive', '--wait', String(waitMs / 1000), '--conflict-exit-code', '75', lockPath,
    process.execPath, '-e',
    "process.stdout.write('BAITED_BUILD_LOCK_ACQUIRED\\n'); process.stdin.resume(); process.stdin.once('end', () => process.exit(0));",
  ], { stdio: ['pipe', 'pipe', 'pipe'] })
  let ready = false
  let stdout = ''
  let stderr = ''
  holder.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4_096) })
  let acquiredResolve
  let acquiredReject
  const acquired = new Promise((resolve, reject) => { acquiredResolve = resolve; acquiredReject = reject })
  const exited = new Promise(resolve => {
    holder.once('error', error => {
      acquiredReject(new Error(`Cannot acquire build lock; Linux flock (util-linux) is required. On Windows/macOS, use WSL/Linux for landing builds: ${error.message}`))
      resolve({ error })
    })
    holder.once('exit', (code, signal) => {
      if (!ready) acquiredReject(new Error(code === 75
        ? `Timed out waiting ${waitMs}ms for build lock: ${lockPath}`
        : `Build lock failed (${code ?? signal}): ${stderr.trim()}`))
      resolve({ code, signal })
    })
  })
  holder.stdout.on('data', chunk => {
    stdout = (stdout + chunk).slice(-128)
    if (!ready && stdout.includes('BAITED_BUILD_LOCK_ACQUIRED\n')) {
      ready = true
      acquiredResolve()
    }
  })
  await acquired
  try {
    return await operation()
  } finally {
    holder.stdin.end()
    const result = await exited
    if (result.code !== 0) throw new Error(`Build lock holder exited unexpectedly (${result.code ?? result.signal})`)
  }
}

export function parseEnvironment(args) {
  if (args.length !== 2 || args[0] !== '--env' || !['dev', 'prod'].includes(args[1])) {
    throw new Error('Usage: node scripts/build-site.mjs --env dev|prod')
  }
  return args[1]
}

export async function copyStaticTree(source, destination, { excludedRoots = [], mediaOnly = false } = {}) {
  const excluded = new Set(excludedRoots)
  async function copyDirectory(from, to, depth) {
    await mkdir(to, { recursive: true })
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || (depth === 0 && excluded.has(entry.name))) continue
      const input = join(from, entry.name)
      const output = join(to, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Static asset symlinks are not allowed: ${input}`)
      if (entry.isDirectory()) await copyDirectory(input, output, depth + 1)
      else if (entry.isFile() && (!mediaOnly || labMediaExtensions.has(extname(entry.name).toLowerCase()))) {
        await copyFile(input, output)
      }
    }
  }
  await copyDirectory(source, destination, 0)
}

export async function prepareStaticSite({ environment, source, destination }) {
  if (!['dev', 'prod'].includes(environment) || basename(destination) !== `site-${environment}`) {
    throw new Error('Static build destination must match site-dev or site-prod')
  }
  await rm(destination, { recursive: true, force: true })
  await copyStaticTree(source, destination, {
    excludedRoots: environment === 'prod' ? ['lab', 'card-lab'] : ['card-lab'],
  })
}

export async function buildSite(environment) {
  const destination = resolve(landingRoot, 'dist', `site-${environment}`)
  await withBuildLock(destination, () => buildSiteLocked(environment, destination))
}

async function buildSiteLocked(environment, destination) {
  await prepareStaticSite({ environment, source: resolve(landingRoot, 'site'), destination })
  if (environment === 'dev') {
    const result = spawnSync(process.execPath, [
      resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config',
      resolve(appRoot, 'vite.card-lab.config.ts'),
    ], { cwd: appRoot, stdio: 'inherit', timeout: 120_000 })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Card Lab build failed (${result.status})`)
    const labRoot = resolve(destination, 'card-lab')
    await rename(resolve(labRoot, 'card-lab.html'), resolve(labRoot, 'index.html'))
    await copyStaticTree(resolve(appRoot, 'public/cards/proofs'), resolve(labRoot, 'cards/proofs'), { mediaOnly: true })
    const mediaRoot = resolve(appRoot, 'public/card-lab')
    const mediaStat = await lstat(mediaRoot).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (mediaStat?.isSymbolicLink()) throw new Error('Card Lab media root must not be a symlink')
    if (mediaStat?.isDirectory()) await copyStaticTree(mediaRoot, labRoot, { mediaOnly: true })
  }
  console.log(`Built landing ${environment}: ${destination}`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await buildSite(parseEnvironment(process.argv.slice(2)))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
