export type ErrorKind = 'missing' | 'server' | 'unavailable' | 'screen' | 'connection' | 'auth' | 'forbidden' | 'limited' | 'request' | 'stopped' | 'setup';
export interface ErrorCopy { code: string; title: string; detail: string; action: string }
export const errorContent: Readonly<Record<ErrorKind, ErrorCopy>>;
export function errorKindForStatus(status: number): ErrorKind;
export function errorKindForDocument(pathname: string, status: number): ErrorKind;
export function sessionErrorKind(failure: { message?: unknown; status?: unknown }): ErrorKind;
export function isDocumentNavigation(request: Request): boolean;
export function isKnownAppPath(pathname: string, edge?: boolean): boolean;
export function renderErrorDocument(kind?: ErrorKind, surface?: 'app' | 'landing', overlay?: boolean): string;
export function withErrorDocument(request: Request, response: Response, surface?: 'app' | 'landing'): Response;
