import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const hostedOrigin = 'https://play-baited.maff.app';
export const backendSecretNames = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY',
  'TWITCH_EXTENSION_CLIENT_ID', 'TWITCH_EXTENSION_SECRET'];

export function hostedSettings(mode, env = process.env) {
  if (!['backend', 'tunnel'].includes(mode)) throw new Error('Choose backend or tunnel.');
  const seconds = Number(env.HOSTED_TEST_SECONDS || 10800);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
    throw new Error('HOSTED_TEST_SECONDS must be 60 to 18000.');
  const required = mode === 'backend' ? backendSecretNames : ['TUNNEL_TOKEN'];
  const missing = required.filter(name => !env[name] || env[name].startsWith('pass://'));
  if (missing.length) throw new Error(`Resolve these Proton references before starting: ${missing.join(', ')}.`);
  if (mode === 'backend' && !/^[a-f0-9]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY))
    throw new Error('TOKEN_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
  return { mode, seconds };
}

// A host-networked container makes the immediate proxy address deterministic on
// this Linux PC. The app itself listens only on loopback, with no Docker port map.
export function backendInvocation(env, containerName) {
  return {
    command: 'docker',
    args: ['run', '--rm', '--init', '--pull=never', '--name', containerName,
      '--network', 'host', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--stop-timeout', '10',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
      '--mount', 'type=volume,source=baited-hosted-test-data,target=/app/data',
      '--env', 'NODE_ENV=production', '--env', 'HOST=127.0.0.1', '--env', 'PORT=3300',
      '--env', `PUBLIC_URL=${hostedOrigin}`, '--env', 'ENABLE_DEMO=false',
      '--env', 'DATA_DIR=/app/data', '--env', 'SPEECH_PROVIDER=moonshine',
      '--env', 'TRUSTED_PROXIES=127.0.0.1',
      ...backendSecretNames.flatMap(name => ['--env', name]),
      // Optional and not a secret: the chat bot's numeric Twitch user ID.
      ...(env.TWITCH_BOT_USER_ID ? ['--env', 'TWITCH_BOT_USER_ID'] : []), 'baited-hosted-test:local'],
    env: { ...systemEnv(env), ...Object.fromEntries(backendSecretNames.map(name => [name, env[name]])),
      ...(env.TWITCH_BOT_USER_ID ? { TWITCH_BOT_USER_ID: env.TWITCH_BOT_USER_ID } : {}) },
  };
}

function systemEnv(env) {
  return Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'XDG_RUNTIME_DIR', 'DOCKER_HOST', 'DOCKER_CONTEXT']
    .filter(name => env[name]).map(name => [name, env[name]]));
}

export function tunnelInvocation(env) {
  return {
    command: 'bash',
    // Bash process substitution creates a real anonymous pipe. Node's stdio
    // "pipe" is a Unix socketpair and cannot be reopened by Go's os.ReadFile.
    // The token is a non-exported shell variable before cloudflared is exec'd.
    // The checked-in config prevents unrelated ~/.cloudflared settings loading.
    args: ['--noprofile', '--norc', '-c', [
      'set -euo pipefail',
      'baited_tunnel_token=$TUNNEL_TOKEN',
      'unset TUNNEL_TOKEN',
      'exec cloudflared tunnel --config "$1" --no-autoupdate --loglevel warn --metrics 127.0.0.1:20249 run --token-file <(printf \'%s\' "$baited_tunnel_token")',
    ].join('\n'), 'baited-tunnel', fileURLToPath(new URL('./cloudflared-hosted.yml', import.meta.url))],
    env: { ...systemEnv(env), TUNNEL_TOKEN: env.TUNNEL_TOKEN },
  };
}

function relaySanitized(stream, target, secrets) {
  let pending = '';
  function write(line) {
    for (const secret of secrets) if (secret) line = line.split(secret).join('[redacted]');
    target.write(`${line}\n`);
  }
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      write(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
    // Never print an unbounded partial line or split a secret across chunks.
    if (pending.length > 65536) pending = '[overlong child output omitted]';
  });
  stream.on('end', () => { if (pending) write(pending); });
}

export async function launchHostedTest(mode, env = process.env) {
  if (process.platform !== 'linux') throw new Error('This launcher requires the Linux host network.');
  const { seconds } = hostedSettings(mode, env);
  const containerName = `baited-hosted-test-${process.pid}`;
  const invocation = mode === 'backend' ? backendInvocation(env, containerName) : tunnelInvocation(env);
  const child = spawn(invocation.command, invocation.args, {
    env: invocation.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const secrets = [...backendSecretNames, 'TUNNEL_TOKEN'].map(name => env[name]).filter(Boolean);
  relaySanitized(child.stdout, process.stdout, secrets);
  relaySanitized(child.stderr, process.stderr, secrets);
  console.log(`Baited hosted test ${mode}: ${hostedOrigin}. Stops after ${seconds / 60} minutes; Ctrl+C stops it now.`);
  let closing = false, force;
  function stop() {
    if (closing) return;
    closing = true;
    child.kill('SIGTERM');
    if (mode === 'backend') {
      // Only this invocation's unique container is eligible for cleanup.
      const stopper = spawn('docker', ['stop', '--time', '10', containerName], { env: systemEnv(env), stdio: 'ignore' });
      const stopDeadline = setTimeout(() => stopper.kill('SIGKILL'), 15000);
      stopper.on('error', () => clearTimeout(stopDeadline));
      stopper.on('exit', () => clearTimeout(stopDeadline));
    }
    force = setTimeout(() => child.kill('SIGKILL'), 20000);
    force.unref();
  }
  const deadline = setTimeout(stop, seconds * 1000);
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, stop);
  return await new Promise(resolveCode => {
    const done = code => {
      clearTimeout(deadline);
      if (force) clearTimeout(force);
      for (const signal of signals) process.off(signal, stop);
      resolveCode(code);
    };
    child.once('error', () => { console.error(`Could not start ${invocation.command}. Check it is installed and available.`); done(1); });
    child.once('exit', code => done(closing ? 0 : code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node ops/hosted-test.mjs backend|tunnel');
    process.exitCode = await launchHostedTest(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
