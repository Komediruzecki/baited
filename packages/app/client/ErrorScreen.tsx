import React, { Component, type ReactNode } from 'react';
import { errorContent, type ErrorKind } from '../shared/error-pages.js';

export function ErrorScreen({ kind = 'missing', onRetry, retrying = false, overlay = typeof location !== 'undefined' && /^\/overlay(?:\/|$)/.test(location.pathname) }: {
  kind?: ErrorKind;
  onRetry?: () => void;
  retrying?: boolean;
  overlay?: boolean;
}) {
  const copy = errorContent[kind];
  if (overlay) return <><link rel="stylesheet" href="/error-page.css" precedence="error" /><main className="baited-error-overlay" role="status">
    <img src="/brand/baited-pixel-white.svg" alt="Baited" width="74" height="20" />
    <h1>Overlay unavailable.</h1><p>{kind === 'missing' ? 'This overlay link isn’t valid. Copy a fresh one from Stream setup.' : 'Refresh this OBS source. If it stays offline, copy a fresh overlay link from Stream setup.'}</p>
    {retrying && <p>Reconnecting automatically…</p>}
  </main></>;
  return <><link rel="stylesheet" href="/error-page.css" precedence="error" /><main className="baited-error" aria-labelledby="error-title">
    <a className="baited-error__brand" href="https://baited.maff.app" aria-label="Baited home"><img src="/brand/baited-pixel-white.svg" alt="Baited" width="185" height="50" /></a>
    <div className="baited-error__scene" aria-hidden="true"><span className="baited-error__mark">{kind === 'missing' ? '404' : '!'}</span></div>
    <div className="baited-error__copy"><p className="baited-error__speaker">Baity says</p><h1 id="error-title">{copy.title}</h1><p className="baited-error__detail">{copy.detail}</p>
      <div className="baited-error__actions">
        {onRetry ? <button className="baited-error__primary" onClick={onRetry}>{kind === 'screen' ? copy.action : 'Try again'}<span aria-hidden="true">↻</span></button> : <a className="baited-error__primary" href="/studio">Back to Studio<span aria-hidden="true">↗</span></a>}
        {onRetry ? <a className="baited-error__secondary" href="/studio">Back to Studio</a> : <a className="baited-error__secondary" href="mailto:hello@irchiinnuss.com">Get help</a>}
      </div>
      {retrying && <p className="baited-error__status" role="status">Reconnecting automatically…</p>}
      <p className="baited-error__code">{copy.code}<span aria-hidden="true">/</span>Baited</p>
    </div>
  </main></>;
}

/** Render failures only. Network, microphone and permission errors keep their own recovery UI. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <ErrorScreen kind="screen" onRetry={() => window.location.reload()} /> : this.props.children;
  }
}
