export const APP_URL = 'https://webscraping-psi.vercel.app/';
const APP_ORIGIN = new URL(APP_URL).origin;

export function navigationTarget(value: string): 'internal' | 'external' | 'blocked' {
  if (value === 'about:blank' || value === 'about:srcdoc') return 'internal';
  try {
    const url = new URL(value);
    if (url.origin === APP_ORIGIN) return 'internal';
    if (url.protocol === 'https:' || url.protocol === 'http:') return 'external';
  } catch { /* Invalid or unexpected navigation stays blocked. */ }
  return 'blocked';
}
