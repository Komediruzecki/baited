import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PREVIEW_PORT || 3318);
const seconds = Number(process.env.PREVIEW_SECONDS || 10800);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PREVIEW_PORT must be an integer from 1024 to 65535.');
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
  throw new Error('PREVIEW_SECONDS must be 60 to 18000.');
if (existsSync(resolve(root, '.env')))
  throw new Error('Local preview requires a copy without .env. Use Proton Pass for live credentials.');
if (!existsSync(resolve(root, 'dist/server/index.js')))
  throw new Error('Build first with pnpm build.');
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/server/index.js', '--static'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port),
    PUBLIC_URL: origin, ENABLE_DEMO: 'true',
    DATA_DIR: process.env.PREVIEW_DATA_DIR || resolve(root, 'data/local-preview'),
    TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '', TOKEN_ENCRYPTION_KEY: '',
    DEEPGRAM_API_KEY: '', TRUSTED_PROXIES: '',
  },
});
console.log(`Local fixture preview: ${origin}. Stops after ${seconds / 60} minutes; Ctrl+C stops it now. The port is fixed and will not fall back.`);
let forced;
function stop() {
  child.kill('SIGTERM');
  forced ||= setTimeout(() => child.kill('SIGKILL'), 5000);
  forced.unref();
}
const lifetime = setTimeout(stop, seconds * 1000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
child.once('error', error => { console.error(error.message); clearTimeout(lifetime); process.exitCode = 1; });
child.once('exit', (code, signal) => {
  clearTimeout(lifetime);
  if (forced) clearTimeout(forced);
  process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1);
});
