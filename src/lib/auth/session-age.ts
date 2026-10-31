/** A session ends after this long without any request (activity keeps it going). */
export const SESSION_IDLE_SECONDS = 60 * 60;

/** Cookie holding the last request's time (Unix seconds); the proxy rewrites it on every request. */
export const LAST_ACTIVE_COOKIE = "kh-last-active";

/**
 * Whether the session has been idle longer than SESSION_IDLE_SECONDS. No (or a garbled) time
 * means the first request after logging in, which is not idle.
 */
export function isIdleExpired(lastActive: string | undefined, nowSeconds: number): boolean {
  const last = Number(lastActive);
  return Number.isFinite(last) && last > 0 && nowSeconds - last > SESSION_IDLE_SECONDS;
}
