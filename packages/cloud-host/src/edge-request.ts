/** Authenticate Cloudflare's client address to Node without trusting public proxy headers. */
const encoder = new TextEncoder();
const INTERNAL_HEADERS = ['cf-container-target-port', 'forwarded', 'x-forwarded-for',
  'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip',
  'x-baited-edge-ip', 'x-baited-edge-time', 'x-baited-edge-signature'];

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', new Uint8Array(key).buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}

export async function containerRequest(request: Request, encryptionKey: string, now = Date.now()): Promise<Request> {
  if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) throw new Error('Cloud edge key is not configured.');
  // CF-Connecting-IP is overwritten by Cloudflare on internet requests. Never use X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 45 || !/^[0-9a-f:.]+$/i.test(ip)) throw new Error('Cloud client address is missing.');
  const bytes = Uint8Array.from(encryptionKey.match(/../g)!, (hex) => parseInt(hex, 16));
  const derivedKey = await hmac(bytes, 'baited:edge-ip:v1');
  const timestamp = String(Math.floor(now / 1000));
  const url = new URL(request.url);
  const signature = await hmac(derivedKey, `${timestamp}\n${ip}\n${request.method}\n${url.pathname}${url.search}`);
  const headers = new Headers(request.headers);
  for (const header of INTERNAL_HEADERS) headers.delete(header);
  headers.set('x-baited-edge-ip', ip);
  headers.set('x-baited-edge-time', timestamp);
  headers.set('x-baited-edge-signature', Array.from(signature, (b) => b.toString(16).padStart(2, '0')).join(''));
  return new Request(request, { headers });
}
