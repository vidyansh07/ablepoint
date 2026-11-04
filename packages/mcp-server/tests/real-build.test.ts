import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DistSource } from '../src';
import { call, connect } from './helpers';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const distDir = path.join(repoRoot, 'apps', 'web', 'dist');
const hasBuild = existsSync(path.join(distDir, 'api', 'v1', 'index.json'));

// Reads whatever build output exists. Skipped cleanly when apps/web has not been built. Never builds anything itself.
describe.skipIf(!hasBuild)('against the real build output in apps/web/dist', () => {
  it('runs every tool against it and agrees with the build\'s own index.json counts', async () => {
    const index = JSON.parse(await readFile(path.join(distDir, 'api', 'v1', 'index.json'), 'utf8'));
    const counts = index.data.counts as Record<string, number>;
    const { client, close } = await connect(new DistSource(distDir));
    try {
      const c = (p: { untrustedContent: unknown }) => p.untrustedContent as Record<string, unknown>;
      const checkMeta = (p: Awaited<ReturnType<typeof call>>['payload']) => {
        expect(p.environment).toBe(index.environment);
        expect(typeof p.generatedAt).toBe('string');
        if (p.environment === 'production') expect(p.stagingNotice).toBeUndefined();
        else expect(p.stagingNotice).toMatch(/STAGING/);
      };

      const org = await call(client, 'get_organisation');
      checkMeta(org.payload);
      expect(typeof (c(org.payload).organisation as { name: string }).name).toBe('string');

      const services = await call(client, 'list_services');
      checkMeta(services.payload);
      expect(c(services.payload).count).toBe(counts.services);
      const firstService = (c(services.payload).services as Array<{ id: string }>)[0];
      if (firstService) expect(((await call(client, 'get_service', { slug: firstService.id })).payload.untrustedContent as { service: { id: string } }).service.id).toBe(firstService.id);

      const regions = await call(client, 'list_regions');
      expect(c(regions.payload).count).toBe(counts.regions);
      const firstRegion = (c(regions.payload).regions as Array<{ id: string }>)[0];
      if (firstRegion) expect((c((await call(client, 'get_region', { slug: firstRegion.id })).payload).region as { id: string }).id).toBe(firstRegion.id);

      const vacancies = await call(client, 'list_vacancies');
      expect(c(vacancies.payload).totalPublished).toBe(counts.vacancies);
      for (const v of c(vacancies.payload).vacancies as Array<{ availability: string; lastVerifiedAt: unknown; warning: unknown }>) {
        expect(v.availability).toBeDefined();
        expect('lastVerifiedAt' in v).toBe(true);
        expect('warning' in v).toBe(true);
      }

      const faqs = await call(client, 'list_faqs');
      expect(c(faqs.payload).totalMatches).toBe(counts.faqs);
      const guides = await call(client, 'list_guides_and_posts');
      expect(c(guides.payload).count).toBe((counts.guides ?? 0) + (counts.posts ?? 0));
      const refer = await call(client, 'how_to_refer');
      checkMeta(refer.payload);
      const search = await call(client, 'search_content', { query: 'support', limit: 10 });
      expect((c(search.payload).results as unknown[]).length).toBeLessThanOrEqual(10);
    } finally {
      await close();
    }
  });
});
