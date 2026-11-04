// @ts-check
import { defineConfig } from 'astro/config';

const siteEnv = process.env.PUBLIC_SITE_ENV ?? 'development';
const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'static',
  outDir: process.env.ASTRO_OUT_DIR ?? 'dist',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  // No inlined scripts/assets: keeps the CSP strict (script-src 'self').
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false }
  // Sitemap and robots.txt are generated from content (src/pages/[file].xml.ts, src/pages/robots.txt.ts) so lastmod is accurate.
});
