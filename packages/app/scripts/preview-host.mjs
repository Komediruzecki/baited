import { isIP } from 'node:net';

export function validatePreviewHost(host) {
  const [a, b] = typeof host === 'string' ? host.split('.').map(Number) : [];
  const privateIPv4 = isIP(host || '') === 4 &&
    (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
  if (host !== '127.0.0.1' && !privateIPv4)
    throw new Error('Preview host must be 127.0.0.1 or a private IPv4 address on this computer.');
  return host;
}

export function previewHost(args = process.argv.slice(2)) {
  if (args.length === 0) return '127.0.0.1';
  if (args.length !== 2 || args[0] !== '--host')
    throw new Error('Usage: preview [--host PRIVATE_IPV4_ADDRESS]');
  return validatePreviewHost(args[1]);
}
