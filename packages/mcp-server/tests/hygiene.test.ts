import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { USER_AGENT, VERSION } from '../src';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const allFiles = walk(pkgDir);
const srcFiles = allFiles.filter((f) => f.startsWith(path.join(pkgDir, 'src') + path.sep));
const read = (f: string) => readFileSync(f, 'utf8');
const pkg = JSON.parse(read(path.join(pkgDir, 'package.json')));

describe('package hygiene', () => {
  it('contains no email address or the owner\'s domain anywhere (sources, fixtures, README, config)', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
    const ownerDomain = '@' + 'ablepointaustralia';
    for (const f of allFiles) {
      const text = read(f);
      expect(email.test(text), path.relative(pkgDir, f)).toBe(false);
      expect(text.includes(ownerDomain), path.relative(pkgDir, f)).toBe(false);
    }
  });

  it('sends a plain User-Agent with just the name and version', () => {
    expect(USER_AGENT).toBe(`ablepoint-mcp/${VERSION}`);
    expect(USER_AGENT).toMatch(/^ablepoint-mcp\/\d+\.\d+\.\d+$/);
  });

  it('keeps VERSION in step with package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('depends only on the MCP SDK (pinned exactly) and zod', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@modelcontextprotocol/sdk', 'zod']);
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.private).toBe(true);
  });

  it('never writes to stdout from source (stdout is the MCP channel)', () => {
    for (const f of srcFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/console\.(log|info|debug|warn|error)/);
      expect(text, f).not.toMatch(/process\.stdout/);
    }
  });

  it('reads only the two documented environment variables, and only in main.ts', () => {
    for (const f of srcFiles) {
      const text = read(f);
      const uses = text.match(/process\.env[.[][^\s;,)]*/g) ?? [];
      if (path.basename(f) === 'main.ts') {
        expect(uses.sort()).toEqual(['process.env.ABLEPOINT_API_BASE_URL', 'process.env.ABLEPOINT_API_DIST']);
      } else {
        expect(uses, f).toEqual([]);
      }
    }
  });

  it('has no write, delete, spawn or arbitrary network code in source', () => {
    for (const f of srcFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/writeFile|appendFile|createWriteStream|unlink|rmSync|\brm\(|mkdir|rename\(|copyFile|chmod/);
      expect(text, f).not.toMatch(/child_process|\bspawn\(|\bexec\(|execSync|eval\(|new Function/);
      expect(text, f).not.toMatch(/XMLHttpRequest|WebSocket|node:http|node:https|node:net|axios|undici/);
      if (path.basename(f) !== 'source.ts') expect(text, f).not.toMatch(/\bfetch\(/);
    }
  });

  it('does not use the SDK\'s deprecated server.tool() or register resources or prompts', () => {
    const server = read(path.join(pkgDir, 'src', 'server.ts'));
    expect(server).not.toMatch(/server\.tool\(/);
    expect(server).not.toMatch(/registerResource|registerPrompt|\.resource\(|\.prompt\(/);
    expect(server.match(/server\.registerTool\(/g)?.length).toBe(10);
  });
});
