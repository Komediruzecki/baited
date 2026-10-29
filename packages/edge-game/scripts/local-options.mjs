import { isAbsolute, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions } from 'miniflare';

export const LOCAL_HOST = '127.0.0.1';
export const LOCAL_PORT = 8797;
export const LOOPBACK_ORIGIN = `http://${LOCAL_HOST}:${LOCAL_PORT}`;
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_TIMEOUT_MS = 60 * 60 * 1000;

// Public test material, not a credential. The worker rejects this authentication
// mode unless the request and the configured host are loopback addresses.
export const LOCAL_FIXTURE_SECRET_B64 = Buffer.from('Baited public local fixture only').toString('base64');

export function validateStatePath(value) {
  if (value === undefined || value === false) return false;
  if (typeof value !== 'string' || !isAbsolute(value) || value.startsWith('//') || value.includes('\0')) {
    throw new Error('BAITED_EDGE_LOCAL_STATE must be an absolute local directory path.');
  }
  const path = resolve(value);
  if (path === parse(path).root) {
    throw new Error('BAITED_EDGE_LOCAL_STATE must name a dedicated directory, not the filesystem root.');
  }
  return path;
}

export function parseLocalSettings(argv = [], env = {}) {
  if (argv.length !== 0) {
    throw new Error('The local edge harness accepts no arguments; remote flags and alternate hosts are forbidden.');
  }
  const rawTimeout = env.BAITED_EDGE_LOCAL_TIMEOUT_MS;
  if (rawTimeout !== undefined && !/^[1-9]\d*$/.test(rawTimeout)) {
    throw new Error('BAITED_EDGE_LOCAL_TIMEOUT_MS must be a positive integer.');
  }
  const timeoutMs = rawTimeout === undefined ? DEFAULT_TIMEOUT_MS : Number(rawTimeout);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`BAITED_EDGE_LOCAL_TIMEOUT_MS must be at most ${MAX_TIMEOUT_MS}.`);
  }
  return {
    timeoutMs,
    statePath: validateStatePath(env.BAITED_EDGE_LOCAL_STATE),
  };
}

export function denyOutbound() {
  return new Response('Outbound network access is disabled in the local edge harness.', { status: 503 });
}

// Port zero and binding overrides are for bounded functional tests only. The
// command-line entrypoint never passes either, and never reads provider config.
export function createLocalOptions({
  port = LOCAL_PORT,
  statePath = false,
  bindings = {},
  script,
} = {}) {
  if (port !== LOCAL_PORT && port !== 0) {
    throw new Error(`Local edge port must be ${LOCAL_PORT}, or zero for an isolated test.`);
  }
  const persistence = validateStatePath(statePath);
  // The pinned Miniflare 5 release requires config/dev worker descriptors. Its
  // public converter preserves the familiar modules/scriptPath construction.
  return convertV4MiniflareOptions({
    name: 'baited-edge-local',
    host: LOCAL_HOST,
    port,
    inspectorPort: 0,
    inspectorHost: LOCAL_HOST,
    cf: false,
    telemetry: { enabled: false },
    unsafeRegisterWorker: false,
    unsafeLocalExplorer: false,
    unsafeObservability: false,
    unsafeInspectDurableObjects: false,
    modules: true,
    scriptPath: fileURLToPath(new URL('../dist/worker.js', import.meta.url)),
    ...(script === undefined ? {} : { script }),
    compatibilityDate: '2026-09-07',
    compatibilityFlags: [],
    bindings: {
      EDGE_POC_ENABLED: 'true',
      EDGE_ALLOWED_HOSTS: `${LOCAL_HOST}:${LOCAL_PORT}`,
      EDGE_ALLOWED_ORIGINS: LOOPBACK_ORIGIN,
      EDGE_ALLOWED_CHANNELS: '123',
      EDGE_LOCAL_FIXTURE_AUTH: 'true',
      EDGE_FIXTURE_SECRET_B64: LOCAL_FIXTURE_SECRET_B64,
      EDGE_STAGING_AUTH: 'false',
      ...bindings,
    },
    durableObjects: { ROOMS: { className: 'ChannelRoom', useSQLite: true } },
    r2Buckets: { ART: 'baited-edge-local-art' },
    resourcePersistencePath: persistence || undefined,
    cacheAPI: false,
    outboundService: denyOutbound,
  });
}
