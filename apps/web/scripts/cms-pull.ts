/**
 * Pull approved content from Sanity into src/content/cms (see src/lib/cms/README.md).
 *
 *   pnpm --filter @ablepoint/web cms:pull                                  # fetch from Sanity (needs env, see below)
 *   pnpm --filter @ablepoint/web cms:pull -- --dry-run                     # print the manifest, write nothing
 *   pnpm --filter @ablepoint/web cms:pull -- --fixture file.json           # offline, from a JSON array of raw documents
 *   pnpm --filter @ablepoint/web cms:pull -- --out some/dir                # must be inside apps/web
 *
 * Environment (HTTP mode only): SANITY_PROJECT_ID, SANITY_DATASET, SANITY_READ_TOKEN. All three are required; nothing is
 * defaulted. The token is never printed. Exit code 0 on success, 1 on any failure, 2 on a usage error.
 * Nothing is written unless the whole pipeline succeeds.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SanityConfigError, SanityFetchError, createSanityClient, readSanityConfig } from '../src/lib/cms/fetch';
import { PullError, fixtureSource, httpSource, resolveOutDir, runPull, writeOutputs, type DocumentSource } from '../src/lib/cms/pull';

const MAX_FIXTURE_BYTES = 50 * 1024 * 1024;
const USAGE = 'usage: cms:pull [--fixture <file.json>] [--out <dir inside apps/web>] [--dry-run]';
const webRoot = fileURLToPath(new URL('..', import.meta.url));

function usageError(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const args = argv.filter((a) => a !== '--');
  let fixture: string | undefined;
  let out: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dryRun = true;
    else if (a === '--fixture' || a === '--out') {
      const v = args[++i];
      if (!v || v.startsWith('--')) usageError(`${a} needs a value.`);
      if (a === '--fixture') fixture = v;
      else out = v;
    } else usageError(`Unknown argument: ${a}`);
  }
  return { fixture, out, dryRun };
}

/** Only our own error types carry messages that are safe to print. Anything else is reduced to its class name. */
function describe(err: unknown): string {
  if (err instanceof SanityConfigError || err instanceof SanityFetchError || err instanceof PullError) return err.message;
  return `Unexpected ${err instanceof Error ? err.name : 'error'}. Re-run with a fixture to isolate it.`;
}

async function main() {
  const { fixture, out, dryRun } = parseArgs(process.argv.slice(2));
  const outDir = resolveOutDir(webRoot, out); // validated in every mode, so a bad --out is refused even in a dry run

  let source: DocumentSource;
  if (fixture) {
    const file = resolve(process.cwd(), fixture);
    if (!existsSync(file) || !statSync(file).isFile()) throw new PullError('The fixture file was not found.');
    if (statSync(file).size > MAX_FIXTURE_BYTES) throw new PullError('The fixture file is too large.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new PullError('The fixture file is not valid JSON.');
    }
    source = fixtureSource(parsed);
  } else {
    const config = readSanityConfig(process.env);
    source = httpSource(createSanityClient(config), config.dataset);
  }

  const result = await runPull(source);
  if (!dryRun) {
    const written = writeOutputs(result.files, outDir);
    console.error(`Wrote ${written.length} files to ${outDir}`);
  }
  process.stdout.write(`${result.files['_manifest.json']}`);
}

main().catch((err) => {
  console.error(`cms:pull failed. ${describe(err)}`);
  process.exit(1);
});
