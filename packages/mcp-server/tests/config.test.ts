import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, isAllowedProtocolAndHost, normaliseBaseUrl, parseCommand } from '../src';

describe('parseCommand', () => {
  it('requires a data source: there is no default', () => {
    expect(() => parseCommand([], {})).toThrow(ConfigError);
    expect(() => parseCommand([], {})).toThrow(/No data source chosen/);
  });

  it('reads --dist and resolves it against the working directory', () => {
    const cmd = parseCommand(['--dist', '../site'], {}, '/work/pkg');
    expect(cmd).toEqual({ command: 'run', source: { kind: 'dist', dir: path.resolve('/work/pkg', '../site') } });
  });

  it('reads --base-url and strips trailing slashes', () => {
    const cmd = parseCommand(['--base-url', 'https://example.invalid/'], {});
    expect(cmd).toEqual({ command: 'run', source: { kind: 'url', baseUrl: 'https://example.invalid' } });
  });

  it('falls back to the two environment variables', () => {
    expect(parseCommand([], { ABLEPOINT_API_DIST: '/abs/site' })).toEqual({ command: 'run', source: { kind: 'dist', dir: '/abs/site' } });
    expect(parseCommand([], { ABLEPOINT_API_BASE_URL: 'https://example.invalid' })).toMatchObject({ command: 'run', source: { kind: 'url' } });
  });

  it('prefers a flag over the other source in the environment', () => {
    const cmd = parseCommand(['--dist', '/abs/site'], { ABLEPOINT_API_BASE_URL: 'https://example.invalid' });
    expect(cmd).toMatchObject({ source: { kind: 'dist' } });
  });

  it('refuses two sources at once', () => {
    expect(() => parseCommand(['--dist', '/a', '--base-url', 'https://example.invalid'], {})).toThrow(/not both/);
    expect(() => parseCommand([], { ABLEPOINT_API_DIST: '/a', ABLEPOINT_API_BASE_URL: 'https://example.invalid' })).toThrow(/not both/);
  });

  it('ignores the leading "--" that pnpm run passes through', () => {
    expect(parseCommand(['--', '--dist', '/abs/site'], {})).toMatchObject({ source: { kind: 'dist', dir: '/abs/site' } });
  });

  it('rejects unknown flags and stray positional arguments', () => {
    expect(() => parseCommand(['--dist', '/a', '--write'], {})).toThrow(ConfigError);
    expect(() => parseCommand(['/a'], {})).toThrow(ConfigError);
  });

  it('supports --help and --version without a source', () => {
    expect(parseCommand(['--help'], {})).toEqual({ command: 'help' });
    expect(parseCommand(['--version'], {})).toEqual({ command: 'version' });
  });
});

describe('base URL rules', () => {
  it('accepts https anywhere', () => {
    expect(normaliseBaseUrl('https://example.invalid')).toBe('https://example.invalid');
    expect(normaliseBaseUrl('https://example.invalid/prefix/')).toBe('https://example.invalid/prefix');
  });

  it('accepts http only for localhost and 127.0.0.1', () => {
    expect(normaliseBaseUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(normaliseBaseUrl('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080');
  });

  it.each([
    'http://example.invalid',
    'http://localhost.example.invalid',
    'http://127.0.0.2',
    'http://0.0.0.0',
    'http://[::1]:8080',
    'ftp://example.invalid',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', (u) => {
    expect(() => normaliseBaseUrl(u)).toThrow(ConfigError);
  });

  it('rejects credentials, query strings and fragments', () => {
    expect(() => normaliseBaseUrl(['https://user:pass', 'example.invalid'].join('@'))).toThrow(/user name or password/);
    expect(() => normaliseBaseUrl('https://example.invalid?x=1')).toThrow(/query string/);
    expect(() => normaliseBaseUrl('https://example.invalid#frag')).toThrow(/query string/);
  });

  it('isAllowedProtocolAndHost matches the same rule for redirects', () => {
    expect(isAllowedProtocolAndHost(new URL('https://example.invalid/x'))).toBe(true);
    expect(isAllowedProtocolAndHost(new URL('http://example.invalid/x'))).toBe(false);
    expect(isAllowedProtocolAndHost(new URL('http://localhost/x'))).toBe(true);
  });
});
