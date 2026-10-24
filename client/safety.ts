import type { Result } from '../shared/types';

/** A new visit always starts silent, and a restored result is never a new win. */
export class WinSoundGate {
  private seenSnapshot = false;
  private lastResult: string | null = null;
  enabled = false;

  receive(result: Result | null): boolean {
    const fresh = this.seenSnapshot && !!result && result.id !== this.lastResult;
    this.seenSnapshot = true;
    this.lastResult = result?.id ?? null;
    return this.enabled && fresh && result?.outcome === 'caught';
  }
}

export function microphoneReady(configured: boolean, consent: boolean, status: string) {
  return configured && consent && status === 'armed';
}

type LeaseUpdate = (body: { armed: boolean; leaseId: string; renew?: boolean }) => Promise<unknown>;

/** A lease belongs to one capture, including requests that finish after cancellation. */
export class MicrophoneLease {
  active = true;
  private armed = false;
  constructor(readonly id: string, private update: LeaseUpdate) {}

  async arm() {
    if (!this.active) return false;
    try {
      await this.update({ armed: true, leaseId: this.id });
    } catch (error) {
      if (!this.active) return false;
      throw error;
    }
    if (!this.active) {
      await this.update({ armed: false, leaseId: this.id });
      return false;
    }
    this.armed = true;
    return true;
  }

  async renew() {
    if (!this.active || !this.armed) return false;
    try {
      await this.update({ armed: true, leaseId: this.id, renew: true });
    } catch (error) {
      if (!this.active) return false;
      throw error;
    }
    return this.active;
  }

  async cancel() {
    this.active = false;
    this.armed = false;
    await this.update({ armed: false, leaseId: this.id });
  }
}
