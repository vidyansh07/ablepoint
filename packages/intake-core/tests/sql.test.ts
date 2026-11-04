import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_STATES } from '../src/uploads';

// STATIC TEXT CHECKS ONLY. The SQL is not parsed or executed by these tests: they cannot show it is valid Postgres.
const sql = readFileSync(new URL('../sql/001_init.sql', import.meta.url), 'utf8');
const lines = sql.split('\n');
const code = lines.filter((l) => !l.trim().startsWith('--')).join('\n');
const TABLES = ['staff_user', 'enquiry', 'person', 'participant_profile', 'consent_record', 'case_assignment', 'document', 'case_event', 'access_log', 'retention_job'];

describe('sql/001_init.sql (static checks)', () => {
  it('declares in its first line that it has not been executed and needs approval', () => {
    expect(lines[0]).toMatch(/^-- NOT EXECUTED — migration execution requires approval/);
  });
  it('defines every docs/05 §3 entity', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`create table intake\\.${t} \\(`));
  });
  it('enables AND forces row level security on every table', () => {
    for (const t of TABLES) {
      expect(code, `enable ${t}`).toMatch(new RegExp(`alter table intake\\.${t}\\s+enable row level security`));
      expect(code, `force ${t}`).toMatch(new RegExp(`alter table intake\\.${t}\\s+force row level security`));
    }
  });
  it('every sensitive table has at least one policy; marketing and sysadmin are never named in sensitive-data policies', () => {
    for (const t of ['enquiry', 'person', 'participant_profile', 'document']) expect(code).toMatch(new RegExp(`create policy \\w+ on intake\\.${t}\\b`));
    const sensitivePolicies = code.split(';').filter((s) => /create policy \w+ on intake\.(enquiry|person|participant_profile|document|consent_record)\b/.test(s));
    for (const p of sensitivePolicies) {
      expect(p).not.toContain("'marketing_staff'");
      expect(p).not.toMatch(/'system_administrator'/); // only via break_glass_active()
    }
  });
  it('sysadmin data access exists only through the break-glass predicate', () => {
    expect(code).toMatch(/create function intake\.break_glass_active/);
    expect(code).toMatch(/interval '4 hours'/);
    expect((code.match(/intake\.break_glass_active\(\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('the audit log is append-only: triggers block update, delete and truncate, and privileges are revoked', () => {
    expect(code).toMatch(/before update or delete on intake\.access_log/);
    expect(code).toMatch(/before truncate on intake\.access_log/);
    expect(code).toMatch(/revoke update, delete, truncate on intake\.access_log/);
    expect(code).not.toMatch(/create policy \w+ on intake\.access_log for (update|delete|all)/);
  });
  it('C3 columns accept only encryption envelopes', () => {
    for (const col of ['dob_enc', 'ndis_number_enc', 'support_needs_enc']) expect(code).toMatch(new RegExp(`${col}\\s+text check \\(${col} is null or ${col} ~ '\\^v1`));
  });
  it('document states match the TypeScript state machine, with a transition trigger', () => {
    for (const s of DOCUMENT_STATES) expect(code).toContain(`'${s}'`);
    expect(code).toMatch(/create trigger document_state_transition/);
    expect(code).toMatch(/\('scanning','released'\)/);
    expect(code).not.toMatch(/\('quarantined','released'\)/); // cannot skip scanning
    expect(code).toMatch(/size_bytes\s+bigint not null check \(size_bytes > 0 and size_bytes <= 10485760\)/);
  });
  it('case_ref shape matches the generator', () => {
    expect(code).toContain("'^AP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$'");
  });
  it('contains no destructive statements (drop, truncate table, delete from, update ... set) and no data inserts', () => {
    expect(code).not.toMatch(/\bdrop\s+(table|schema|database|role)\b/i);
    expect(code).not.toMatch(/\btruncate\s+table\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\binsert\s+into\b/i);
    expect(code).not.toMatch(/\bcopy\b/i);
  });
  it('is a single transaction and contains no credentials', () => {
    expect(code).toMatch(/^\s*begin;/m);
    expect(code).toMatch(/^\s*commit;/m);
    expect(sql).not.toMatch(/password\s+['"]|secret|BEGIN PRIVATE KEY|postgres:\/\//i);
  });
  it('SECURITY DEFINER functions pin search_path', () => {
    const defs = code.split(/create function/).filter((s) => /security definer/i.test(s));
    expect(defs.length).toBeGreaterThanOrEqual(2);
    for (const d of defs) expect(d).toMatch(/set search_path = ''/);
  });
});
