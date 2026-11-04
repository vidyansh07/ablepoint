// Generates vercel.json (security headers, staging noindex, legacy redirects) from the same data the site uses.
// Redirects are emitted only for approved records in production, and all records elsewhere (so staging can test them).
import { writeFileSync } from 'node:fs';
import { redirects } from '../src/data/redirects.ts';

const env = process.env.PUBLIC_SITE_ENV ?? 'development';
const intake = process.env.PUBLIC_INTAKE_ENDPOINT ? new URL(process.env.PUBLIC_INTAKE_ENDPOINT).origin : '';
const gtm = process.env.PUBLIC_GTM_ID ? ['https://www.googletagmanager.com'] : [];
const ga = process.env.PUBLIC_GTM_ID ? ['https://www.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'] : [];
const turnstile = process.env.PUBLIC_TURNSTILE_SITEKEY ? 'https://challenges.cloudflare.com' : '';

const csp = [
  "default-src 'self'",
  `script-src 'self' ${turnstile} ${gtm.join(' ')}`.trim().replace(/\s+/g, ' '),
  "style-src 'self'",
  `img-src 'self' data: ${[...gtm, ...ga.slice(0, 1)].join(' ')}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${intake} ${ga.join(' ')}`.trim().replace(/\s+/g, ' '),
  `frame-src ${turnstile || "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const headers = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(env === 'production' ? [] : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]),
];

const active = redirects.filter((r) => env !== 'production' || r.approved);
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  cleanUrls: false,
  trailingSlash: true,
  headers: [
    { source: '/(.*)', headers },
    { source: '/_astro/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    // Public read-only content API: readable by any agent or browser, never indexed as pages.
    { source: '/api/(.*)', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }] },
  ],
  redirects: active.map((r) => ({ source: r.from, destination: r.to, statusCode: r.status === 410 ? 410 : r.status })),
};
const out = process.env.OUT_FILE ?? 'vercel.json';
writeFileSync(new URL(`../${out}`, import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log(`vercel.json written [${env}]: ${active.length} redirects, CSP ${csp.length} chars`);
