/** Regenerates raw-documents.json from docs.ts:  pnpm --filter @ablepoint/web exec tsx tests/fixtures/cms/write-fixture.ts */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFixture } from './docs';

const target = fileURLToPath(new URL('./raw-documents.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(buildFixture(), null, 2)}\n`, 'utf8');
console.log(`wrote ${target}`);
