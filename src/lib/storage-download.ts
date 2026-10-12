/**
 * A signed Storage URL that downloads under `fileName`. Object names are ids, so the
 * real name is added here; supabase-js's own `download` option encodes the name twice,
 * which garbles Korean names.
 */
export function downloadUrl(signedUrl: string, fileName: string): string {
  return `${signedUrl}&download=${encodeURIComponent(fileName)}`;
}
