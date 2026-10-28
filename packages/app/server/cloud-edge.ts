import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { RequestHandler } from 'express';

/** Only the configured Worker can attest the client address used by rate limits. */
export class CloudEdge {
  private key: Buffer;
  constructor(key: string, private now = Date.now) {
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Cloud edge verification requires a 32-byte encryption key.');
    this.key = createHmac('sha256', Buffer.from(key, 'hex')).update('baited:edge-ip:v1').digest();
  }
  clientIp(request: IncomingMessage, target = request.url ?? ''): string | undefined {
    const ip = request.headers['x-baited-edge-ip'], timestamp = request.headers['x-baited-edge-time'];
    const signature = request.headers['x-baited-edge-signature'];
    if (typeof ip !== 'string' || !isIP(ip) || typeof timestamp !== 'string' || !/^(0|[1-9]\d{0,10})$/.test(timestamp) ||
      typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || !target.startsWith('/') ||
      Math.abs(Math.floor(this.now() / 1000) - Number(timestamp)) > 60) return undefined;
    const expected = createHmac('sha256', this.key)
      .update(`${timestamp}\n${ip}\n${request.method}\n${target}`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return undefined;
    return ip;
  }
  middleware(): RequestHandler {
    return (request, response, next) => {
      const ip = this.clientIp(request, request.originalUrl);
      if (!ip) {
        response.status(403).json({ error: 'Request rejected.' });
        return;
      }
      // Express normally derives this getter from socket/proxy headers. A signed
      // address takes precedence even if someone supplies X-Forwarded-For.
      Object.defineProperty(request, 'ip', { value: ip, configurable: false, writable: false });
      next();
    };
  }
}
