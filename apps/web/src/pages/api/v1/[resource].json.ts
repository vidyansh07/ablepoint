import type { APIRoute, GetStaticPaths } from 'astro';
import { buildApi } from '../../../lib/api';
import { apiInputs } from '../../../lib/api-inputs';

const origin = (site?: URL) => site?.origin ?? 'http://localhost:4321';
export const getStaticPaths: GetStaticPaths = () => {
  const keys = Object.keys(buildApi(apiInputs('http://localhost')));
  return keys.map((resource) => ({ params: { resource } }));
};
export const GET: APIRoute = ({ params, site }) => {
  const api = buildApi(apiInputs(origin(site)));
  const body = api[params.resource!];
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
