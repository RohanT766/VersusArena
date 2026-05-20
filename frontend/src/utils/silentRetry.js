/** Wait ms — used between silent retries (never shown to user). */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch until success or abort. Never throws for transient network failures.
 * Returns null if aborted.
 */
export async function fetchUntilOk(url, options = {}, { signal, baseDelayMs = 600, maxDelayMs = 4000 } = {}) {
  let attempt = 0;
  while (!signal?.aborted) {
    try {
      const res = await fetch(url, options);
      if (signal?.aborted) return null;
      return res;
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) return null;
      attempt += 1;
      const delay = Math.min(baseDelayMs * attempt, maxDelayMs);
      await wait(delay);
    }
  }
  return null;
}
