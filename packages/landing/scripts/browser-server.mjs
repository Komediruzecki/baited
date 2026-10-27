import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { parseArgs, stripVTControlCharacters } from 'node:util'

// The package's bin wrapper maps a signalled CLI exit to code 0. Run the same
// installed CLI directly so CI retains the actual exit signal.
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/wrangler-dist/cli.js', import.meta.url))
const serverArgs = ['--no-warnings', wrangler, 'dev', '--env', 'dev', '--local', '--ip', '127.0.0.1', '--port', '4372',
  '--inspector-port', '9372', '--compatibility-date', '2026-08-08', '--show-interactive-dev-session=false']

// Explicit local-preview options keep CI's strict ports and ten-minute default.
// Accept no arbitrary Wrangler flags or runtime values through this entry point.
export function browserServerOptions(argv = []) {
  const { values } = parseArgs({ args: argv, options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '4372' },
    'inspector-port': { type: 'string', default: '9372' },
    'lifetime-ms': { type: 'string', default: '600000' },
  }, strict: true, allowPositionals: false })
  if (!['127.0.0.1', '0.0.0.0'].includes(values.host)) throw new RangeError('Invalid preview host')
  const integer = (value, min, max) => {
    if (!/^[1-9]\d*$/.test(value) || Number(value) < min || Number(value) > max) throw new RangeError('Invalid preview limit')
    return Number(value)
  }
  const port = integer(values.port, 1024, 65535)
  const inspector = integer(values['inspector-port'], 1024, 65535)
  const lifetimeMs = integer(values['lifetime-ms'], 1000, 10800000)
  if (port === inspector) throw new RangeError('Preview ports must differ')
  const args = [...serverArgs]
  for (const [flag, value] of [['--ip', values.host], ['--port', port], ['--inspector-port', inspector]]) args[args.indexOf(flag) + 1] = String(value)
  return { args, lifetimeMs }
}

// Wrangler writes exception stacks to stdout, which Playwright normally hides.
// Its debug output also contains internal authentication headers: forward only
// structural error information, never messages, config objects or header values.
export function serverDiagnostic(input) {
  const line = stripVTControlCharacters(input).trim()
  if (/secret|token|password|credential|authorization|cookie|headers|binding|\bvars\b/i.test(line)) return null
  // ProxyWorker errors cross JSON and are wrapped in an empty Error by Wrangler.
  // Retain this verified controller/reason and structural fields of its cause;
  // never forward the serialized message or surrounding config object.
  if (line === 'Error in ProxyController: Error inside ProxyWorker') return line
  const causeName = /^name: ['"](Error|TypeError|RangeError|SyntaxError|URIError|ReferenceError|EvalError|AggregateError|AbortError|DOMException)['"],?$/.exec(line)
  if (causeName) return `cause name: ${causeName[1]}`
  const frame = /^at (?:.+? \()?((?:node:|file:\/\/\/|\/)[\w./:@ +%-]+:\d+:\d+)\)?$/.exec(line)
  if (frame) return `at ${frame[1]}`
  // util.inspect may quote each stack line separately or escape newlines inside
  // the stack value. Extract only complete frame locations, not their prefix.
  const quotedStack = /^(?:stack: )?['"]/.test(line)
  if (quotedStack) {
    const frames = []
    for (const part of line.replace(/^(?:stack: )?['"]/, '').split('\\n')) {
      const frameLine = part.replace(/['"]\s*\+?$/, '').trim()
      const nested = /^at (?:.+? \()?((?:node:|file:\/\/\/|\/)[\w./:@ +%-]+:\d+:\d+)\)?$/.exec(frameLine)
      if (nested) frames.push(`at ${nested[1]}`)
    }
    if (frames.length) return frames.join('\n')
  }
  const name = /^(?:Caused by: )?([A-Za-z_$][\w$]*(?:Error|Exception)|Error)(?: \[[A-Z0-9_]+\])?(?::|$)/.exec(line)?.[1]
  const code = /\b(?:ERR_[A-Z0-9_]+|EACCES|EADDRINUSE|EADDRNOTAVAIL|ECONNABORTED|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|EIO|EMFILE|ENETUNREACH|ENFILE|ENOENT|ENOMEM|ENOSPC|ENOTFOUND|EPIPE|ESRCH|ETIMEDOUT)\b/.exec(line)?.[0]
  if (name) return code ? `${name} (${code})` : name
  if (code && /^(?:\[?code\]?:|code:)/.test(line)) return `code: ${code}`
  return null
}

export function runBrowserServer({ command = process.execPath, args = serverArgs, environment = process.env,
  report = message => process.stderr.write(`[landing-browser] ${message}\n`), lifetimeMs = 600_000,
  killAfterMs = 2_000 } = {}) {
  return new Promise(resolveExit => {
    const child = spawn(command, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...environment, WRANGLER_LOG: 'debug', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
    })
    let killTimer
    let timedOut = false
    let spawnFailed = false
    const signalGroup = signal => {
      if (!child.pid) return
      try { process.kill(-child.pid, signal) } catch (error) {
        if (error.code !== 'ESRCH') report(`Child cleanup failed (${error.code || 'unknown code'})`)
      }
    }
    const stop = signal => {
      signalGroup(signal)
      if (child.pid && !killTimer) killTimer = setTimeout(() => signalGroup('SIGKILL'), killAfterMs)
    }
    const signals = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => stop(signal)]))
    for (const [signal, handler] of signals) process.on(signal, handler)
    const lifetime = setTimeout(() => {
      timedOut = true
      report(`Local test server exceeded its ${lifetimeMs}ms lifetime`)
      stop('SIGTERM')
    }, lifetimeMs)
    for (const stream of [child.stdout, child.stderr]) {
      const lines = createInterface({ input: stream })
      lines.on('line', line => {
        const diagnostic = serverDiagnostic(line)
        if (diagnostic) report(diagnostic)
      })
    }
    child.once('error', error => {
      spawnFailed = true
      report(`Wrangler could not start (${error.code || 'unknown code'})`)
    })
    // The CLI may exit before its workerd descendants. Tear down this exact
    // isolated process group, including on Playwright cancellation and timeout.
    child.once('exit', () => stop('SIGTERM'))
    child.once('close', (code, signal) => {
      // A descendant can ignore SIGTERM and close its output before this event.
      // Finish the owned group before cancelling the fallback timer.
      signalGroup('SIGKILL')
      clearTimeout(lifetime)
      clearTimeout(killTimer)
      for (const [name, handler] of signals) process.off(name, handler)
      report(`Wrangler exited (code=${code ?? 'none'}, signal=${signal ?? 'none'})`)
      resolveExit(timedOut ? 124 : spawnFailed ? 1 : code ?? 128 + (constants.signals[signal] || 0))
    })
  })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await runBrowserServer(browserServerOptions(process.argv.slice(2))) }
  catch { process.stderr.write('[landing-browser] Invalid local-preview options\n'); process.exitCode = 1 }
}
