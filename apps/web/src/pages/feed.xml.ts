import type { APIRoute } from 'astro';
import { buildAtomFeed } from '../lib/api';
import { apiInputs } from '../lib/api-inputs';

export const GET: APIRoute = ({ site }) => new Response(buildAtomFeed(apiInputs(site?.origin ?? 'http://localhost:4321')), { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
