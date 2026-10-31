/** Equal jitter spreads recoveries without removing the exponential backoff cap. */
export function retryDelay(attempt: number, maximum = 60000, random = Math.random): number {
  const cap = Math.min(maximum, 1000 * 2 ** Math.min(attempt, 6));
  return Math.round(cap * (0.5 + 0.5 * random()));
}
