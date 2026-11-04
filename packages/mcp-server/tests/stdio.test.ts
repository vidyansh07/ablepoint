import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { FIXTURE_SITE } from './helpers';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(pkgDir, 'bin', 'ablepoint-mcp.mjs');
const CLEAN_ENV = { PATH: process.env.PATH ?? '' };

describe('real process over stdio (bin/ablepoint-mcp.mjs, run through tsx)', () => {
  it('talks to the SDK stdio client: lists the ten tools and answers a call', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, '--dist', FIXTURE_SITE], cwd: pkgDir, stderr: 'pipe' });
    const client = new Client({ name: 'stdio-test', version: '0.0.0' });
    let stderr = '';
    try {
      await client.connect(transport);
      transport.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(10);
      const res = (await client.callTool({ name: 'how_to_refer', arguments: {} })) as CallToolResult;
      const first = res.content[0];
      expect(first && first.type === 'text' ? JSON.parse(first.text).untrustedContent.telephoneDisplay : null).toBe('0000 000 000');
      await new Promise((r) => setTimeout(r, 100));
      expect(stderr).not.toContain('Example Provider'); // logs never carry content
    } finally {
      await client.close();
    }
  }, 30_000);

  it('writes only JSON-RPC to stdout, logs nothing about requests, and exits when stdin closes', async () => {
    const marker = 'SECRET-MARKER-98765';
    const child = spawn(process.execPath, [BIN, '--dist', FIXTURE_SITE], { cwd: pkgDir, env: CLEAN_ENV, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + '\n');
    const waitFor = async (pred: () => boolean) => {
      const end = Date.now() + 20_000;
      while (!pred()) {
        if (Date.now() > end) throw new Error('timed out waiting for output');
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } });
    await waitFor(() => out.includes('"id":1'));
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_content', arguments: { query: marker } } });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_service', arguments: { slug: marker.toLowerCase() } } });
    await waitFor(() => out.includes('"id":2') && out.includes('"id":3'));
    child.stdin.end();
    const code = await exited;

    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(JSON.parse(line).jsonrpc, line.slice(0, 80)).toBe('2.0');
    expect(code).toBe(0);
    expect(err).toMatch(/started/);
    expect(err).not.toContain(marker);
    expect(err.toLowerCase()).not.toContain(marker.toLowerCase());
  }, 40_000);

  it('exits with a readable error and an empty stdout when no data source is given', () => {
    const r = spawnSync(process.execPath, [BIN], { cwd: pkgDir, env: CLEAN_ENV, encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/No data source chosen/);
    expect(r.stderr).toMatch(/--dist/);
  }, 40_000);

  it('refuses a non-localhost http base URL at start-up, before any network call', () => {
    const r = spawnSync(process.execPath, [BIN, '--base-url', 'http://fixtures.example.invalid'], { cwd: pkgDir, env: CLEAN_ENV, encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/must use https/);
  }, 40_000);

  it('explains a dist directory that has no api/v1 folder', () => {
    const r = spawnSync(process.execPath, [BIN, '--dist', path.join(pkgDir, 'tests')], { cwd: pkgDir, env: CLEAN_ENV, encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/does not contain api\/v1/);
  }, 40_000);

  it('reads the data source from ABLEPOINT_API_DIST', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN], cwd: pkgDir, env: { ...CLEAN_ENV, ABLEPOINT_API_DIST: FIXTURE_SITE }, stderr: 'pipe' });
    const client = new Client({ name: 'stdio-test-env', version: '0.0.0' });
    try {
      await client.connect(transport);
      const res = (await client.callTool({ name: 'get_organisation', arguments: {} })) as CallToolResult;
      expect(res.isError).toBeFalsy();
    } finally {
      await client.close();
    }
  }, 30_000);
});
