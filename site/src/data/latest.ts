/** Build-time "latest version": registry first; the plugin repo's own
 * package.json as the offline-safe fallback (the repo tracks releases). */
import { readFileSync } from 'node:fs';

export interface Latest { version: string; source: 'registry' | 'repo-fallback' | 'unknown' }

function repoVersion(): string | null {
  try {
    const raw = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8');
    const v = (JSON.parse(raw) as { version?: string }).version;
    return typeof v === 'string' ? v : null;
  } catch { return null }
}

export async function getLatest(): Promise<Latest> {
  try {
    const res = await fetch('https://registry.npmjs.org/@treeseed%2fdsh-chapters/latest', {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const j = (await res.json()) as { version?: string };
      if (typeof j.version === 'string' && j.version.length > 0) return { version: j.version, source: 'registry' };
    }
  } catch { /* build box offline / registry hiccup */ }
  const rv = repoVersion();
  return rv !== null ? { version: rv, source: 'repo-fallback' } : { version: '0.0.0-dev', source: 'unknown' };
}
