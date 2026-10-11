/** Build-time identity of the plugin this site documents — the typed face of
 * `plugin-version.mjs`, which the Astro config imports directly (a `.md` page
 * cannot import a module, and the config needs the number synchronously).
 *
 * No network is touched at build time. Two reasons, both measured here:
 *  - an offline or pristine build (the GitHub Pages runner may not reach npmjs)
 *    must succeed, and a fetch there is a timeout waiting to mis-report;
 *  - the previous registry-first helper's offline fallback resolved the WRONG
 *    manifest — a `../../../package.json` from inside the bundler lands on
 *    `site/package.json`, i.e. the site's own `0.0.1` — so the "safe" path
 *    printed a version that had never been published. The reader validates the
 *    manifest by its `name` before trusting anything it says.
 *
 * Why the repo's own version is authoritative: `release.yml` refuses to publish
 * unless the tag equals this file's `version`, so at any release commit the two
 * are the same number. And nothing on this site tells a human to install a
 * numbered version — every instruction says `@latest`, which cannot go stale. */
import { PLUGIN_NAME, readPluginVersion as read } from './plugin-version.mjs'

export interface PluginVersion {
  name: string
  version: string
  source: 'repo-package-json' | 'unknown'
  /** The manifest the number came from — empty when nothing matched. */
  path: string
}

export { PLUGIN_NAME }

/** Resolve the current release from the repo's own manifest. Deterministic: the
 * same input always yields the same page bytes. */
export const readPluginVersion = read as () => PluginVersion
