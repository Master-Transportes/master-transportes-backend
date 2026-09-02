import log from "encore.dev/log";

const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 30_000;

export function calculateDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
  const jitter = 0.5 + Math.random();
  return Math.floor(exponential * jitter);
}

export async function startWithRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; component?: string },
): Promise<T | undefined> {
  const maxAttempts = options?.maxAttempts ?? 30;
  const component = options?.component ?? "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      log.info(`${component} started successfully`, { attempt, component });
      return result;
    } catch (err) {
      if (attempt === maxAttempts) {
        log.error(`${component} failed after ${maxAttempts} attempts`, {
          attempt,
          error: err,
          component,
        });
        return undefined;
      }
      const delay = calculateDelay(attempt);
      log.warn(`${component} start failed, retrying in ${delay}ms`, {
        attempt,
        error: err,
        component,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
