import type { Post } from './types';

/**
 * Blog posts live as one JSON file each in src/content/posts/. Agents and editors add files through the ingest CLI
 * (scripts/content/ingest.ts), which validates the draft and runs the quality gates; humans approve with
 * scripts/content/approve.ts. Nothing reaches production unless its approval hash matches (AR-7).
 */
const files = import.meta.glob<Post>('../content/posts/*.json', { eager: true, import: 'default' });
export const posts: Post[] = Object.values(files).sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
export const getPost = (slug: string) => posts.find((p) => p.slug === slug);

export const CATEGORY_LABELS: Record<Post['category'], string> = {
  'for-coordinators': 'For support coordinators',
  housing: 'Housing and accommodation',
  'funding-explained': 'Funding explained',
  'working-with-us': 'Working with us',
  regional: 'Regional news',
  news: 'News',
};
