/**
 * Chooses between the local typed files and the generated CMS output. NOT wired into any page or data file yet.
 *
 *   cmsOr('region', regions)   // regions from src/content/cms/region.json when CONTENT_SOURCE=sanity, else the local list
 *
 * The CMS list is used only when BOTH hold: CONTENT_SOURCE is exactly "sanity" and a generated file exists for that type.
 * Otherwise the local list is returned unchanged, which is how the site builds today. With CONTENT_SOURCE=sanity and no file,
 * a warning is printed once per type so a missing pull is not mistaken for CMS content.
 *
 * The generated files hold view models whose approval record was written by pull.ts after the raw Sanity gate passed; the
 * site's own `visible()` / `isShown()` gate (including the reviewer allow-list) still applies to them in production.
 *
 * `import.meta.glob` is resolved by Vite at build time, so this module is for the Astro build only. The pull CLI must not import it.
 */
import type { CmsOutputType } from './map';

export type { CmsOutputType };

const generated = import.meta.glob('../content/cms/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** `CONTENT_SOURCE` from the process environment (Astro build, tests), falling back to Vite's `import.meta.env`. */
export function readContentSource(): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env?.CONTENT_SOURCE : undefined;
  const fromVite = (import.meta.env as Record<string, string | undefined> | undefined)?.CONTENT_SOURCE;
  return fromProcess ?? fromVite;
}

export interface CmsOrOptions {
  getSource?: () => string | undefined;
  warn?: (message: string) => void;
}

/** Factory so tests can inject the files and the environment. The exported `cmsOr` below uses the real glob and environment. */
export function makeCmsOr(files: Readonly<Record<string, unknown>>, options: CmsOrOptions = {}) {
  const getSource = options.getSource ?? readContentSource;
  const warn = options.warn ?? ((m: string) => console.warn(m));
  const byType = new Map<string, unknown[]>();
  for (const [path, content] of Object.entries(files)) {
    const name = (path.split('/').pop() ?? '').replace(/\.json$/, '');
    if (name === '' || name.startsWith('_') || !Array.isArray(content)) continue;
    byType.set(name, content);
  }
  const warned = new Set<string>();
  return function cmsOr<T>(type: CmsOutputType, local: T[]): T[] {
    if (getSource() !== 'sanity') return local;
    const found = byType.get(type);
    if (found) return found as T[];
    if (!warned.has(type)) {
      warned.add(type);
      warn(`CONTENT_SOURCE=sanity but there is no generated file for "${type}"; using the local data. Run the CMS pull first.`);
    }
    return local;
  };
}

export const cmsOr = makeCmsOr(generated);
