import type { APIRoute, GetStaticPaths } from 'astro';
import { IS_PRODUCTION } from '../lib/env';
import { apiInputs } from '../lib/api-inputs';
import { buildSitemapEntries, buildSitemapXml } from '../lib/seo';

// Production only: staging and development never publish a sitemap (docs/04 §5).
export const getStaticPaths: GetStaticPaths = () => (IS_PRODUCTION ? [{ params: { file: 'sitemap' } }] : []);
export const GET: APIRoute = ({ site }) => new Response(buildSitemapXml(buildSitemapEntries(apiInputs(site?.origin ?? 'http://localhost:4321'))), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
