/** Bound an internal RPC wait even when cancellation cannot stop an operation
 * already admitted by the receiving Durable Object. Mutating callers must still
 * be idempotent or reconcile authoritative state before applying a late result. */
export async function internalFetch(stub: Pick<DurableObjectStub, 'fetch'>, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      stub.fetch(input, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('internal_request_timeout')); }, 5000);
      }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
