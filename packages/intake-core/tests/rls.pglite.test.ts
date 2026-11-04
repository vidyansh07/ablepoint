import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Behaviour tests for sql/001_init.sql run against an IN-MEMORY PGlite instance (WebAssembly Postgres).
 * No real database is touched, no migration is "executed" in any environment, and all rows are synthetic.
 * This verifies the draft parses and that row-level security does what docs/05 says. It does NOT replace review of the
 * file against the managed Postgres version chosen later, pgaudit, or infrastructure-level controls.
 */

const sql = readFileSync(join(__dirname, '..', 'sql', '001_init.sql'), 'utf8');
let db: PGlite;

const ids = {
  staffA: '00000000-0000-4000-8000-0000000000a1',
  staffB: '00000000-0000-4000-8000-0000000000a2',
  regional: '00000000-0000-4000-8000-0000000000a3',
  enqA: '10000000-0000-4000-8000-000000000001',
  enqB: '10000000-0000-4000-8000-000000000002',
  personA: '20000000-0000-4000-8000-000000000001',
  personB: '20000000-0000-4000-8000-000000000002',
  docA: '30000000-0000-4000-8000-000000000001',
};

async function as(role: string, app: { role?: string; staff?: string; regions?: string; ticket?: string; until?: string } = {}) {
  await db.exec('reset role');
  const set = async (k: string, v: string) => db.query('select set_config($1, $2, false)', [k, v]);
  await set('app.role', app.role ?? '');
  await set('app.staff_id', app.staff ?? '');
  await set('app.regions', app.regions ?? '');
  await set('app.break_glass_ticket', app.ticket ?? '');
  await set('app.break_glass_until', app.until ?? '');
  await db.exec(`set role ${role}`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role app_public_intake nologin; create role app_staff_api nologin; create role app_scanner nologin; create role intake_definer nologin bypassrls;`);
  await db.exec(sql);
  // Synthetic seed as the superuser (bypasses RLS). Names are obviously fake.
  await db.exec(`
    insert into intake.staff_user (id, idp_subject, role, regions) values
      ('${ids.staffA}', 'test|a', 'intake_staff', '{}'),
      ('${ids.staffB}', 'test|b', 'intake_staff', '{}'),
      ('${ids.regional}', 'test|r', 'regional_staff', '{newcastle}');
    insert into intake.enquiry (id, case_ref, referrer_type, region, service_categories, contact_method, consent_notice_version, consent_at, idempotency_key_hash) values
      ('${ids.enqA}', 'AP-ABCD-234', 'coordinator', 'newcastle', '{sil}', 'phone', 'v1', now(), 'hash-a'),
      ('${ids.enqB}', 'AP-EFGH-567', 'family', 'dubbo', '{sda}', 'email', 'v1', now(), 'hash-b');
    insert into intake.person (id, enquiry_id, role, name) values
      ('${ids.personA}', '${ids.enqA}', 'participant', 'Test Person One'),
      ('${ids.personB}', '${ids.enqB}', 'participant', 'Test Person Two');
    insert into intake.participant_profile (person_id, display_name, communication_preferences) values
      ('${ids.personA}', 'Test One', 'Prefers short calls');
    insert into intake.case_assignment (enquiry_id, staff_id) values
      ('${ids.enqA}', '${ids.staffA}'),
      ('${ids.enqA}', '${ids.regional}');
    insert into intake.document (id, enquiry_id, object_key, original_filename, mime, size_bytes, uploaded_by) values
      ('${ids.docA}', '${ids.enqA}', 'objects/synthetic-1', 'referral.pdf', 'application/pdf', 1024, 'test');
  `);
});

afterAll(async () => {
  await db.close();
});

describe('draft schema (in-memory only)', () => {
  it('creates every documented table with RLS enabled and forced', async () => {
    await db.exec('reset role');
    const r = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'intake' and c.relkind = 'r' order by 1`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([
      'access_log', 'case_assignment', 'case_event', 'consent_record', 'document', 'enquiry', 'participant_profile', 'person', 'retention_job', 'staff_user',
    ]);
    for (const row of r.rows) {
      expect(row.relrowsecurity, `${row.relname} RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} RLS forced`).toBe(true);
    }
  });
});

describe('public intake role is insert-only', () => {
  it('can insert a new enquiry but cannot read anything back', async () => {
    await as('app_public_intake');
    await db.exec(`insert into intake.enquiry (id, case_ref, referrer_type, region, service_categories, contact_method, consent_notice_version, consent_at, idempotency_key_hash)
      values ('10000000-0000-4000-8000-000000000009', 'AP-JKMN-PQR', 'self', 'orange', '{sil}', 'phone', 'v1', now(), 'hash-new')`);
    await expect(db.query('select * from intake.enquiry')).rejects.toThrow(/permission denied/i);
  });
  it('cannot create an enquiry that is not in the "new" status', async () => {
    await as('app_public_intake');
    await expect(
      db.exec(`insert into intake.enquiry (id, case_ref, status, referrer_type, region, service_categories, contact_method, consent_notice_version, consent_at, idempotency_key_hash)
        values ('10000000-0000-4000-8000-000000000008', 'AP-STVW-XYZ', 'active', 'self', 'orange', '{sil}', 'phone', 'v1', now(), 'hash-active')`),
    ).rejects.toThrow(/row-level security/i);
  });
  it('cannot insert a person with a role other than enquirer', async () => {
    await as('app_public_intake');
    await expect(
      db.exec(`insert into intake.person (id, enquiry_id, role, name) values ('20000000-0000-4000-8000-000000000009', '${ids.enqA}', 'participant', 'Nope Nope')`),
    ).rejects.toThrow(/row-level security/i);
  });
  it('rejects a malformed case reference at the database', async () => {
    await as('app_public_intake');
    await expect(
      db.exec(`insert into intake.enquiry (id, case_ref, referrer_type, region, service_categories, contact_method, consent_notice_version, consent_at, idempotency_key_hash)
        values ('10000000-0000-4000-8000-000000000007', 'AP-ILOU-000', 'self', 'orange', '{sil}', 'phone', 'v1', now(), 'hash-bad')`),
    ).rejects.toThrow(/check constraint|violates/i);
  });
});

describe('staff access follows assignment and role', () => {
  it('intake staff see only assigned enquiries', async () => {
    await as('app_staff_api', { role: 'intake_staff', staff: ids.staffA });
    const r = await db.query<{ case_ref: string }>('select case_ref from intake.enquiry order by 1');
    expect(r.rows.map((x) => x.case_ref)).toEqual(['AP-ABCD-234']);
  });
  it('a staff member with no assignments sees nothing', async () => {
    await as('app_staff_api', { role: 'intake_staff', staff: ids.staffB });
    const r = await db.query('select 1 from intake.enquiry');
    expect(r.rows).toHaveLength(0);
    const p = await db.query('select 1 from intake.person');
    expect(p.rows).toHaveLength(0);
  });
  it('intake managers see all enquiries', async () => {
    await as('app_staff_api', { role: 'intake_manager', staff: ids.staffA });
    const r = await db.query('select 1 from intake.enquiry');
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
  });
  it('marketing staff see no enquiry, person, profile or document rows', async () => {
    await as('app_staff_api', { role: 'marketing_staff', staff: ids.staffA });
    for (const t of ['enquiry', 'person', 'participant_profile', 'document', 'consent_record']) {
      const r = await db.query(`select 1 from intake.${t}`);
      expect(r.rows, t).toHaveLength(0);
    }
  });
});

describe('regional staff get need-to-know data only', () => {
  it('have no direct access to person, profile or document tables', async () => {
    await as('app_staff_api', { role: 'regional_staff', staff: ids.regional, regions: 'newcastle' });
    for (const t of ['person', 'participant_profile', 'document', 'consent_record']) {
      const r = await db.query(`select 1 from intake.${t}`);
      expect(r.rows, t).toHaveLength(0);
    }
  });
  it('the restricted view returns only assigned cases in their region, with no DOB, NDIS number or support needs', async () => {
    await as('app_staff_api', { role: 'regional_staff', staff: ids.regional, regions: 'newcastle' });
    const r = await db.query<Record<string, unknown>>('select * from intake.regional_participant_view()');
    expect(r.rows).toHaveLength(1);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(['case_ref', 'communication_preferences', 'contact_method', 'display_name', 'region', 'services']);
  });
  it('the restricted view is empty for other roles and for regional staff outside their region', async () => {
    await as('app_staff_api', { role: 'intake_manager', staff: ids.staffA });
    expect((await db.query('select * from intake.regional_participant_view()')).rows).toHaveLength(0);
    await as('app_staff_api', { role: 'regional_staff', staff: ids.regional, regions: 'dubbo' });
    expect((await db.query('select * from intake.regional_participant_view()')).rows).toHaveLength(0);
  });
});

describe('audit log is append-only', () => {
  it('staff can append; only compliance officers can read', async () => {
    await as('app_staff_api', { role: 'intake_staff', staff: ids.staffA });
    await db.exec(`insert into intake.access_log (actor, role, action, outcome) values ('test', 'intake_staff', 'view', 'success')`);
    expect((await db.query('select 1 from intake.access_log')).rows).toHaveLength(0);
    await as('app_staff_api', { role: 'compliance_officer', staff: ids.staffA });
    expect((await db.query('select 1 from intake.access_log')).rows.length).toBeGreaterThanOrEqual(1);
  });
  it('update and delete are refused, even for compliance officers', async () => {
    await as('app_staff_api', { role: 'compliance_officer', staff: ids.staffA });
    await expect(db.exec(`update intake.access_log set outcome = 'error'`)).rejects.toThrow(/permission denied/i);
    await expect(db.exec('delete from intake.access_log')).rejects.toThrow(/permission denied/i);
  });
  it('triggers also block the table owner / superuser', async () => {
    await db.exec('reset role');
    await expect(db.exec(`update intake.access_log set outcome = 'error'`)).rejects.toThrow(/append-only/i);
    await expect(db.exec('delete from intake.access_log')).rejects.toThrow(/append-only/i);
    await expect(db.exec('truncate intake.access_log')).rejects.toThrow(/append-only/i);
  });
});

describe('document lifecycle', () => {
  it('only legal scan transitions are allowed and "released" is terminal', async () => {
    await db.exec('reset role');
    await expect(db.exec(`update intake.document set scan_status = 'released' where id = '${ids.docA}'`)).rejects.toThrow(/illegal document state transition/);
    for (const next of ['quarantined', 'scanning', 'released']) await db.exec(`update intake.document set scan_status = '${next}' where id = '${ids.docA}'`);
    await expect(db.exec(`update intake.document set scan_status = 'scanning' where id = '${ids.docA}'`)).rejects.toThrow(/illegal document state transition/);
  });
  it('download key is returned only for released documents', async () => {
    await db.exec('reset role');
    const released = await db.query<{ k: string | null }>(`select intake.downloadable_object_key('${ids.docA}') as k`);
    expect(released.rows[0]?.k).toBe('objects/synthetic-1');
    await db.exec(
      `insert into intake.document (id, enquiry_id, object_key, original_filename, mime, size_bytes, uploaded_by)
       values ('30000000-0000-4000-8000-000000000002', '${ids.enqA}', 'objects/synthetic-2', 'x.pdf', 'application/pdf', 10, 'test')`,
    );
    const pending = await db.query<{ k: string | null }>(`select intake.downloadable_object_key('30000000-0000-4000-8000-000000000002') as k`);
    expect(pending.rows[0]?.k).toBeNull();
  });
  it('the scanner role can change scan_status only', async () => {
    await as('app_scanner');
    await expect(db.exec(`update intake.document set original_filename = 'evil.pdf'`)).rejects.toThrow(/permission denied/i);
    await expect(db.query('select object_key from intake.document')).rejects.toThrow(/permission denied/i);
  });
  it('rejects path-like filenames and oversize files at the database', async () => {
    await db.exec('reset role');
    await expect(
      db.exec(`insert into intake.document (id, enquiry_id, object_key, original_filename, mime, size_bytes, uploaded_by)
        values ('30000000-0000-4000-8000-000000000003', '${ids.enqA}', 'objects/s3', '../../etc/passwd', 'application/pdf', 10, 't')`),
    ).rejects.toThrow(/check constraint|violates/i);
    await expect(
      db.exec(`insert into intake.document (id, enquiry_id, object_key, original_filename, mime, size_bytes, uploaded_by)
        values ('30000000-0000-4000-8000-000000000004', '${ids.enqA}', 'objects/s4', 'big.pdf', 'application/pdf', 99999999, 't')`),
    ).rejects.toThrow(/check constraint|violates/i);
  });
});

describe('sensitive profile fields must be encrypted envelopes', () => {
  it('rejects plaintext in an *_enc column', async () => {
    await db.exec('reset role');
    await expect(db.exec(`update intake.participant_profile set ndis_number_enc = '4300000000' where person_id = '${ids.personA}'`)).rejects.toThrow(/check constraint|violates/i);
  });
});

describe('aggregates suppress small numbers', () => {
  it('hides cells with fewer than 5 enquiries and is closed to other roles', async () => {
    await as('app_staff_api', { role: 'marketing_staff', staff: ids.staffA });
    expect((await db.query('select * from intake.enquiry_counts()')).rows).toHaveLength(0); // only 3 synthetic enquiries
    await as('app_staff_api', { role: 'intake_staff', staff: ids.staffA });
    expect((await db.query('select * from intake.enquiry_counts()')).rows).toHaveLength(0);
  });
  it('shows a cell once it reaches the threshold', async () => {
    await db.exec('reset role');
    for (let i = 0; i < 5; i++) {
      await db.query(
        `insert into intake.enquiry (id, case_ref, referrer_type, region, service_categories, contact_method, consent_notice_version, consent_at, idempotency_key_hash)
         values ($1, $2, 'self', 'tamworth', '{core-support}', 'phone', 'v1', now(), $3)`,
        [`40000000-0000-4000-8000-00000000000${i}`, `AP-WXYZ-23${i}`.replace('WXYZ', ['WXYZ', 'WXYV', 'WXYT', 'WXYS', 'WXYR'][i]!), `agg-${i}`],
      );
    }
    await as('app_staff_api', { role: 'marketing_staff', staff: ids.staffA });
    const r = await db.query<{ region: string; enquiries: number | string }>('select region, enquiries from intake.enquiry_counts()');
    expect(r.rows.map((x) => x.region)).toContain('tamworth');
    expect(Number(r.rows.find((x) => x.region === 'tamworth')?.enquiries)).toBe(5);
  });
});

describe('break-glass access', () => {
  const in1h = () => new Date(Date.now() + 3600_000).toISOString();
  const in9h = () => new Date(Date.now() + 9 * 3600_000).toISOString();
  it('a system administrator has no data access without a ticket', async () => {
    await as('app_staff_api', { role: 'system_administrator', staff: ids.staffA });
    expect((await db.query('select 1 from intake.enquiry')).rows).toHaveLength(0);
  });
  it('a ticketed session within 4 hours can read, read-only', async () => {
    await as('app_staff_api', { role: 'system_administrator', staff: ids.staffA, ticket: 'TKT-1', until: in1h() });
    expect((await db.query('select 1 from intake.enquiry')).rows.length).toBeGreaterThan(0);
    await expect(db.exec(`update intake.enquiry set status = 'contacted'`)).resolves.not.toThrow(); // zero rows updated: no update policy for this role
    await as('app_staff_api', { role: 'system_administrator', staff: ids.staffA, ticket: 'TKT-1', until: in1h() });
    const after = await db.query<{ status: string }>(`select status from intake.enquiry where case_ref = 'AP-ABCD-234'`);
    expect(after.rows[0]?.status).toBe('new');
  });
  it('a window longer than 4 hours is refused', async () => {
    await as('app_staff_api', { role: 'system_administrator', staff: ids.staffA, ticket: 'TKT-2', until: in9h() });
    expect((await db.query('select 1 from intake.enquiry')).rows).toHaveLength(0);
  });
  it('other roles cannot use break-glass settings', async () => {
    await as('app_staff_api', { role: 'marketing_staff', staff: ids.staffA, ticket: 'TKT-3', until: in1h() });
    expect((await db.query('select 1 from intake.enquiry')).rows).toHaveLength(0);
  });
});
