import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/api';
import { apiInputs } from '../lib/api-inputs';

export const GET: APIRoute = ({ site }) => new Response(buildLlmsTxt(apiInputs(site?.origin ?? 'http://localhost:4321')), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
