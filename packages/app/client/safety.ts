import type { Result } from '../shared/types';

/** A new visit always starts silent, and a restored result is never a new win. */
export class WinSoundGate {
  private seenSnapshot = false;
  private lastResult: string | null = null;
  enabled = false;

  receive(result: Pick<Result, 'id' | 'outcome'> | null): boolean {
    const fresh = this.seenSnapshot && !!result && result.id !== this.lastResult;
    this.seenSnapshot = true;
    this.lastResult = result?.id ?? null;
    return this.enabled && fresh && result?.outcome === 'caught';
  }
}

export function microphoneReady(configured: boolean, consent: boolean, status: string) {
  return configured && consent && status === 'armed';
}

type LeaseBody = { armed: boolean; leaseId: string; renew?: boolean };
type LeaseUpdate = (body: LeaseBody, signal?: AbortSignal) => Promise<unknown>;
const leaseDuration = 30000, requestTimeout = 10000;
const terminalLeaseCodes = new Set(['lease_owner', 'mic_expired', 'studio_not_connected', 'microphone_required']);
function transientLeaseFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const { status, code, name } = error as { status?: number; code?: string; name?: string };
  if (code && terminalLeaseCodes.has(code)) return false;
  if (typeof status === 'number') return status >= 500 && status <= 599;
  return error instanceof TypeError || name === 'AbortError' || name === 'TimeoutError';
}

/** Only known server codes become microphone instructions, never response text. */
export function microphoneLeaseMessage(error: unknown): string {
  const { status, code } = (error && typeof error === 'object' ? error : {}) as { status?: number; code?: string };
  if (code === 'lease_owner' || code === 'mic_expired')
    return 'This microphone session ended or moved to another Studio tab. Enable it again here.';
  if (code === 'studio_not_connected')
    return 'Studio is disconnected. Wait for it to reconnect, then enable your microphone again.';
  if (status === 401 || status === 403)
    return 'Your sign-in could not be confirmed. Reconnect Twitch, then enable your microphone again.';
  if (status === 429)
    return 'Microphone checks were rate-limited. Wait a moment, then enable it again.';
  return 'The microphone connection could not be confirmed. Check your connection, then enable it again.';
}

/** A lease belongs to one capture, including requests that finish after cancellation. */
export class MicrophoneLease {
  active = true;
  private armed = false;
  private validUntil = 0;
  private arming: Promise<boolean> | undefined;
  private armAbort: AbortController | undefined;
  private cancellation: Promise<void> | undefined;
  private renewal: Promise<boolean> | undefined;
  private renewalAbort: AbortController | undefined;
  private retryWait: { timer: ReturnType<typeof setTimeout>; finish: () => void } | undefined;
  constructor(readonly id: string, private update: LeaseUpdate,
    private options: { onRecovery?: (recovering: boolean) => void } = {}) {}

  private boundedUpdate(body: LeaseBody, controller = new AbortController(), lateSuccess?: () => void) {
    let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort!: () => void;
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('The microphone check was canceled.', 'AbortError'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        reject(new DOMException('The microphone check timed out.', 'TimeoutError'));
        controller.abort();
      }, requestTimeout);
    });
    let operation: Promise<unknown>;
    try { operation = this.update(body, controller.signal); }
    catch (error) { operation = Promise.reject(error); }
    const observed = operation.then((value) => {
      if (finished || !this.active) lateSuccess?.();
      return value;
    });
    return Promise.race([observed, deadline]).finally(() => {
      finished = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
    });
  }

  arm(): Promise<boolean> {
    if (!this.active) return Promise.resolve(false);
    // A capture gets one arm attempt. Recovery uses a fresh user-approved capture.
    return this.arming ??= this.armOnce();
  }

  private async armOnce() {
    const started = Date.now();
    const controller = new AbortController();
    this.armAbort = controller;
    // Aborting a fetch does not prove the authority canceled its mutation.
    // A late success must disarm only this old lease, without blocking a replacement.
    const compensate = () => { void this.boundedUpdate({ armed: false, leaseId: this.id }).catch(() => {}); };
    try {
      await this.boundedUpdate({ armed: true, leaseId: this.id }, controller, compensate);
      if (!this.active) return false;
      if (Date.now() >= started + leaseDuration) {
        compensate();
        throw Object.assign(new Error('The microphone check arrived after its lease expired.'), { code: 'mic_expired' });
      }
    } catch (error) {
      if (!this.active) return false;
      throw error;
    } finally {
      if (this.armAbort === controller) this.armAbort = undefined;
    }
    this.armed = true;
    // Request start is conservative even when its successful response was delayed.
    this.validUntil = started + leaseDuration;
    return true;
  }

  renew(): Promise<boolean> {
    if (!this.active || !this.armed) return Promise.resolve(false);
    if (!this.renewal) this.renewal = this.renewWithRecovery().finally(() => { this.renewal = undefined; });
    return this.renewal;
  }

  private async renewWithRecovery() {
    let recovering = false;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!this.active) return false;
        const started = Date.now();
        const controller = new AbortController();
        this.renewalAbort = controller;
        try {
          // A single probe is safe after a background timer delay: valid active
          // audio may have extended this exact lease on the server. renew:true
          // cannot create a lease, and only confirmed local validity permits retries.
          await this.boundedUpdate({ armed: true, leaseId: this.id, renew: true }, controller);
          if (!this.active) return false;
          if (Date.now() >= started + leaseDuration)
            throw Object.assign(new Error('The microphone check arrived after its lease expired.'), { code: 'mic_expired' });
          this.validUntil = started + leaseDuration;
          return true;
        } catch (error) {
          if (!this.active) return false;
          const delay = (attempt + 1) * 1000;
          if (!transientLeaseFailure(error) || attempt >= 2 || Date.now() + delay + requestTimeout >= this.validUntil)
            throw error;
          if (!recovering) { recovering = true; this.options.onRecovery?.(true); }
          await new Promise<void>((resolve) => {
            this.retryWait = { timer: setTimeout(resolve, delay), finish: resolve };
          });
          this.retryWait = undefined;
        } finally {
          if (this.renewalAbort === controller) this.renewalAbort = undefined;
        }
      }
      return false;
    } finally {
      if (recovering) this.options.onRecovery?.(false);
    }
  }

  cancel(): Promise<void> {
    this.active = false;
    this.armed = false;
    this.validUntil = 0;
    this.armAbort?.abort();
    this.renewalAbort?.abort();
    if (this.retryWait) { clearTimeout(this.retryWait.timer); this.retryWait.finish(); this.retryWait = undefined; }
    return this.cancellation ??= this.boundedUpdate({ armed: false, leaseId: this.id }).then(() => {});
  }
}
