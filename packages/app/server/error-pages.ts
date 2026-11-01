import type { Request, Response, NextFunction } from 'express';
import { errorKindForDocument, isDocumentNavigation, isKnownAppPath, renderErrorDocument, type ErrorKind } from '../shared/error-pages.js';

/** Only recognized transient HTTP failures override a document's generic fallback status. */
export function documentFailureStatus(error: unknown, fallback = 500): number {
  const failure = error as { status?: unknown; statusCode?: unknown } | null;
  const status = failure?.status ?? failure?.statusCode;
  return status === 429 || status === 503 ? status : fallback;
}

export function sendErrorDocument(req: Request, res: Response, status: number, kind?: ErrorKind): boolean {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const headers = new Headers();
  for (const name of ['accept', 'sec-fetch-dest']) {
    const value = req.get(name);
    if (value) headers.set(name, value);
  }
  // Only the path is needed for content negotiation. Never reflect a capability or OAuth query.
  const request = new globalThis.Request(new URL(req.path, 'https://baited.invalid'), { method: req.method, headers });
  if (!isDocumentNavigation(request)) return false;
  res.status(status).type('html').set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow').vary('Accept');
  res.send(req.method === 'HEAD' ? '' : renderErrorDocument(kind ?? errorKindForDocument(req.path, status), 'app', /^\/overlay(?:\/|$)/.test(req.path)));
  return true;
}

/** Place after API/auth routes and before the development SPA fallback. */
export function unknownDocument(req: Request, res: Response, next: NextFunction) {
  if (!isKnownAppPath(req.path) && sendErrorDocument(req, res, 404)) return;
  next();
}

/** Vite runs as a custom middleware server: only exact app paths may bootstrap React. */
export function appDocumentFallback({ template, transform }: {
  template: () => Promise<string>;
  transform: (url: string, html: string) => Promise<string>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(req.method) || !isKnownAppPath(req.path)) {
      if (!sendErrorDocument(req, res, 404)) res.status(404).json({ error: 'Route not found.' });
      return;
    }
    try {
      const html = await transform(req.originalUrl, await template());
      res.status(200).type('html').set('Cache-Control', 'no-store').send(req.method === 'HEAD' ? '' : html);
    } catch (error) { next(error); }
  };
}

/** Place after static/Vite middleware so failures there also have a safe HTML response. */
export function terminalError(_error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) { next(_error); return; }
  if (!sendErrorDocument(req, res, documentFailureStatus(_error))) res.status(500).json({ error: 'Baited could not complete this request. Try again shortly.' });
}
