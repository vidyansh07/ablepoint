import type { APIRoute } from 'astro';
import { SITE_ENV } from '../lib/env';
import { buildRobotsTxt } from '../lib/seo';

export const GET: APIRoute = ({ site }) =>
  new Response(buildRobotsTxt({ env: SITE_ENV, origin: site?.origin ?? 'http://localhost:4321', aiTraining: import.meta.env.AI_TRAINING === 'block' ? 'block' : 'allow' }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
