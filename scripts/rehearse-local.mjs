import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seconds = Number(process.env.REHEARSAL_SECONDS || 10800);
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
  throw new Error('REHEARSAL_SECONDS must be 60 to 18000.');
if (existsSync(resolve(root, '.env')))
  throw new Error('Local rehearsal refuses .env. Supply credentials through Proton Pass.');
if (!existsSync(resolve(root, 'dist/server/index.js')))
  throw new Error('Build first with pnpm build.');
const required = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'DEEPGRAM_API_KEY', 'TOKEN_ENCRYPTION_KEY'];
const missing = required.filter(name => !process.env[name] || process.env[name].startsWith('pass://'));
if (missing.length)
  throw new Error(`Resolve these credentials with pass-cli run before starting: ${missing.join(', ')}.`);
if (!/^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY))
  throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters, stored in Proton Pass.');

const dataDir = resolve(process.env.BAIT_LIVE_DATA_DIR || resolve(homedir(), '.local/share/bait/live-local'));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const child = spawn(process.execPath, ['dist/server/index.js', '--static'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3000',
    PUBLIC_URL: 'http://localhost:3000', ENABLE_DEMO: 'false',
    DATA_DIR: dataDir, TRUSTED_PROXIES: '',
  },
});
console.log(`Local provider rehearsal: http://localhost:3000. Demo input is disabled. Stops after ${seconds / 60} minutes; Ctrl+C stops it now. The port is fixed and will not fall back.`);
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
