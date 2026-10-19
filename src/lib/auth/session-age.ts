import type { AMREntry } from "@supabase/supabase-js";

/** A session ends this long after logging in, even while it is being used. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

/**
 * Whether a session logged in longer ago than SESSION_MAX_AGE_SECONDS, judged from the
 * access token's `amr` claim (when each auth method was used in this session).
 */
export function isSessionExpired(amr: AMREntry[] | string[] | undefined, nowSeconds: number): boolean {
  // shortcut: the string-only amr format has no timestamps, so such a session never expires here;
  // Supabase issues the timestamped format, so upgrade only if that changes.
  const times = (amr ?? []).flatMap((entry) => (typeof entry === "string" ? [] : [entry.timestamp]));
  return times.length > 0 && nowSeconds - Math.min(...times) > SESSION_MAX_AGE_SECONDS;
}
