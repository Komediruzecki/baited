import { retryDelay } from './retry';

/** Public pages can recover unattended; this only discovers runtime, never arms audio. */
export function createRuntimeSessionLoader<T>({ load, onSession, onError, automatic = false,
  random = Math.random }: {
  load: (signal: AbortSignal) => Promise<T>;
  onSession: (session: T) => void;
  onError: (error: Error, retrying: boolean) => void;
  automatic?: boolean;
  random?: () => number;
}) {
  let stopped = false, generation = 0, failures = 0, retryUntil = 0;
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; controller?.abort(); controller = undefined; };
  const run = async (current: number) => {
    const request = new AbortController(); controller = request;
    try {
      const session = await load(request.signal);
      if (!stopped && current === generation) onSession(session);
    } catch (error) {
      if (stopped || current !== generation) return;
      const status = (error as { status?: number })?.status;
      const transient = status === undefined || status >= 500;
      const delay = retryDelay(failures++, 30000, random);
      const retrying = automatic && transient && Date.now() + delay <= retryUntil;
      onError(error instanceof Error ? error : new Error('The server did not respond. Try again.'), retrying);
      if (retrying) timer = setTimeout(() => { timer = undefined; void run(current); }, delay);
    } finally { if (controller === request) controller = undefined; }
  };
  return {
    reload() {
      if (stopped) return;
      generation++; cancel(); failures = 0; retryUntil = Date.now() + 300000;
      void run(generation);
    },
    destroy() { stopped = true; generation++; cancel(); },
  };
}
