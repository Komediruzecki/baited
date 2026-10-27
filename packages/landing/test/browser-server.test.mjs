import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { browserServerOptions, runBrowserServer, serverDiagnostic } from '../scripts/browser-server.mjs'

test('preview options retain strict CI defaults and validate explicit local limits', () => {
  const defaults = browserServerOptions()
  const after = flag => defaults.args[defaults.args.indexOf(flag) + 1]
  assert.equal(after('--ip'), '127.0.0.1')
  assert.equal(after('--port'), '4372')
  assert.equal(after('--inspector-port'), '9372')
  assert.equal(defaults.lifetimeMs, 600000)
  const preview = browserServerOptions(['--host', '0.0.0.0', '--port', '4374', '--inspector-port', '9374', '--lifetime-ms', '10800000'])
  assert.equal(preview.args[preview.args.indexOf('--ip') + 1], '0.0.0.0')
  assert.equal(preview.args[preview.args.indexOf('--port') + 1], '4374')
  assert.equal(preview.args[preview.args.indexOf('--inspector-port') + 1], '9374')
  assert.equal(preview.lifetimeMs, 10800000)
  for (const args of [
    ['--host', 'example.test'], ['--host', '192.168.1.1'], ['--port', '0'], ['--port', '65536'],
    ['--port', '4374;echo'], ['--inspector-port', '4372'], ['--lifetime-ms', '10800001'],
    ['--lifetime-ms', '100'], ['--lifetime-ms', 'Infinity'], ['--arbitrary-option', 'value'], ['positional'],
  ]) assert.throws(() => browserServerOptions(args))
})

test('browser server diagnostics expose error structure without runtime or message values', () => {
  assert.equal(serverDiagnostic('AggregateError [ECONNREFUSED]: arbitrary private message'), 'AggregateError (ECONNREFUSED)')
  assert.equal(serverDiagnostic("  code: 'ENOENT',"), 'code: ENOENT')
  assert.equal(serverDiagnostic('    at internalConnectMultiple (node:net:1132:18)'), 'at node:net:1132:18')
  assert.equal(serverDiagnostic('    at readFile (/workspace/worker.js:12:4)'), 'at /workspace/worker.js:12:4')
  assert.equal(serverDiagnostic('TypeError: a private URL https://example.test/?key=private-value'), 'TypeError')
  for (const line of [
    'reloadComplete: {headers: {"MF-Proxy-Shared-Secret":"not-a-real-secret"}}',
    'Error: authorization header is private', 'Error: token is private',
    'vars: { PRIVATE_VALUE: "not-a-real-secret" }', 'an ordinary debug payload',
  ]) assert.equal(serverDiagnostic(line), null)
})

test('serialized ProxyWorker causes retain only verified structural diagnostics', () => {
  assert.equal(serverDiagnostic('Error in ProxyController: Error inside ProxyWorker'), 'Error in ProxyController: Error inside ProxyWorker')
  assert.equal(serverDiagnostic("name: 'TypeError',"), 'cause name: TypeError')
  assert.equal(serverDiagnostic('name: "AbortError"'), 'cause name: AbortError')
  assert.equal(serverDiagnostic("stack: 'TypeError: private-value\\n    at postProcess (/worker/ProxyWorker.js:25:7)\\n    at node:internal/process/task_queues:104:5'"),
    'at /worker/ProxyWorker.js:25:7\nat node:internal/process/task_queues:104:5')
  assert.equal(serverDiagnostic("'    at queue (file:///worker/ProxyWorker.js:29:8)\\n' +"), 'at file:///worker/ProxyWorker.js:29:8')
  for (const line of [
    "message: 'private-value',", "stack: 'Error: private-value'", "name: 'PrivateValueError',",
    'Error in ProxyController: arbitrary private reason', 'Error in PrivateController: Error inside ProxyWorker',
    "stack: 'Error: private header\\n    at headers (/worker/ProxyWorker.js:1:1)'",
    "stack: 'Error: token=private-value\\n    at queue (/worker/ProxyWorker.js:1:1)'",
    "config: { stack: 'Error: private-value\\n    at queue (/worker/ProxyWorker.js:1:1)' }",
  ]) assert.equal(serverDiagnostic(line), null)
})

test('browser server preserves failure status and only forwards safe diagnostics', async () => {
  const messages = []
  const code = await runBrowserServer({
    args: ['-e', `console.error('AggregateError [ECONNRESET]: private-message');
      console.log('    at connect (node:net:12:3)');
      console.log('headers: {"MF-Proxy-Shared-Secret":"not-a-real-secret"}'); process.exit(7)`],
    report: message => messages.push(message), lifetimeMs: 5_000, killAfterMs: 100,
  })
  assert.equal(code, 7)
  assert.deepEqual(messages.slice(0, -1).sort(), ['AggregateError (ECONNRESET)', 'at node:net:12:3'].sort())
  assert.equal(messages.at(-1), 'Wrangler exited (code=7, signal=none)')
})

test('a signalled server exit remains a failing status with its actual signal', async () => {
  const messages = []
  const code = await runBrowserServer({ args: ['-e', "process.kill(process.pid, 'SIGKILL')"],
    report: message => messages.push(message), lifetimeMs: 5_000, killAfterMs: 100 })
  assert.equal(code, 137)
  assert.deepEqual(messages, ['Wrangler exited (code=none, signal=SIGKILL)'])
})

for (const { name, parentResists, inheritOutput } of [
  { name: 'cancellation stops a resistant child and grandchild', parentResists: true, inheritOutput: true },
  { name: 'CLI exit cannot leave a resistant grandchild with closed output', parentResists: false, inheritOutput: false },
]) test(name, { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baited-browser-lifecycle-'))
  const pidsFile = join(directory, 'pids.json')
  const moduleURL = new URL('../scripts/browser-server.mjs', import.meta.url).href
  const fixture = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs');
    process.on('SIGTERM',${parentResists ? '()=>{}' : '()=>process.exit(0)'});
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],
      {stdio:[${inheritOutput ? "'inherit','inherit','inherit'" : "'ignore','ignore','ignore'"},'ipc']});
    child.once('message',()=>writeFileSync(${JSON.stringify(pidsFile)}, JSON.stringify({parent:process.pid,grandchild:child.pid})));
    setInterval(()=>{},1000);`
  const supervisor = spawn(process.execPath, ['--input-type=module', '-e',
    `import {runBrowserServer} from ${JSON.stringify(moduleURL)};
      process.exitCode=await runBrowserServer({args:['-e',${JSON.stringify(fixture)}],report:()=>{},killAfterMs:100,lifetimeMs:5000});`],
  { stdio: 'ignore' })
  const closed = new Promise(resolve => supervisor.once('close', (code, signal) => resolve({ code, signal })))
  let pids
  try {
    const deadline = Date.now() + 4_000
    while (!pids && Date.now() < deadline) {
      pids = await readFile(pidsFile, 'utf8').then(JSON.parse).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
      if (!pids) await delay(20)
    }
    assert.ok(pids, 'the isolated child group must be ready before cancellation')
    supervisor.kill('SIGTERM')
    assert.deepEqual(await closed, { code: parentResists ? 137 : 0, signal: null })
    for (const pid of Object.values(pids)) {
      const state = await readFile(`/proc/${pid}/stat`, 'utf8').then(stat => stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3))
        .catch(error => { if (error.code !== 'ENOENT') throw error; return null })
      assert.ok(state === null || state === 'Z', `test descendant ${pid} must no longer be running`)
    }
  } finally {
    supervisor.kill('SIGTERM')
    await closed
    if (pids) {
      try { process.kill(-pids.parent, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    await rm(directory, { recursive: true, force: true })
  }
})
