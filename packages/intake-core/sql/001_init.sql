-- NOT EXECUTED — migration execution requires approval. Do not run this file against any database until it has been reviewed and approved.
--
-- DRAFT schema for the restricted participant-intake database (docs/05 §3 entities, §4 roles, §6 controls).
-- Target: PostgreSQL 15+ in an Australian region. Verification so far: it parses and its row-level-security,
-- append-only, document-lifecycle, encryption-envelope and small-number-suppression behaviour is exercised by
-- tests/rls.pglite.test.ts against an IN-MEMORY embedded Postgres (PGlite) with synthetic rows. It has NOT been run
-- on the managed Postgres version/provider chosen later, has no pgaudit/backup/KMS/IdP wiring, and is still a
-- reviewable design, not an approved migration. Synthetic data only; staging must never receive production data.
--
-- Connection model (not created here; infrastructure-as-code to define):
--   app_public_intake  Step-1 service. INSERT only (enquiry, person, consent_record, case_event, access_log).
--   app_staff_api      Staff API. Per transaction the API MUST run, after authenticating the user:
--                        SELECT set_config('app.staff_id',  '<uuid>', true);
--                        SELECT set_config('app.role',      '<role>', true);
--                        SELECT set_config('app.regions',   'central-coast,newcastle', true);
--                      and for a break-glass session additionally app.break_glass_ticket / app.break_glass_until.
--                      The database user behind app_staff_api must be unreachable by end users.
--   app_scanner        Malware-scan worker. May only change document.scan_status.
--   intake_definer     NOLOGIN, BYPASSRLS owner of the SECURITY DEFINER helper functions below.
-- None of these roles owns the tables; every table has FORCE ROW LEVEL SECURITY and no policy means no access.
--
-- Limits of this file: PostgreSQL cannot log SELECTs by itself, so read auditing is the API's access_log
-- writes plus pgaudit (to be configured). RLS is the second layer; the API's `can()` check is the first.

begin;

create schema if not exists intake;
revoke all on schema intake from public;

-- ---------------------------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------------------------
create function intake.current_staff() returns uuid
  language sql stable as $$ select nullif(current_setting('app.staff_id', true), '')::uuid $$;

create function intake.current_app_role() returns text
  language sql stable as $$ select coalesce(current_setting('app.role', true), '') $$;

create function intake.current_regions() returns text[]
  language sql stable as $$ select string_to_array(coalesce(current_setting('app.regions', true), ''), ',') $$;

-- Break-glass: system administrators only, read-only, ticketed, time-boxed to 4 hours.
create function intake.break_glass_active() returns boolean
  language sql stable as $$
    select intake.current_app_role() = 'system_administrator'
       and coalesce(current_setting('app.break_glass_ticket', true), '') <> ''
       and coalesce(nullif(current_setting('app.break_glass_until', true), '')::timestamptz, '-infinity'::timestamptz) > now()
       and coalesce(nullif(current_setting('app.break_glass_until', true), '')::timestamptz, '-infinity'::timestamptz) <= now() + interval '4 hours'
  $$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table intake.staff_user (
  id          uuid primary key default gen_random_uuid(),
  idp_subject text not null unique,
  role        text not null check (role in ('intake_administrator','intake_manager','intake_staff','regional_staff','compliance_officer','system_administrator','marketing_staff')),
  regions     text[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table intake.enquiry (
  id                    uuid primary key,                       -- supplied by the service (no RETURNING needed under insert-only RLS)
  case_ref              text not null unique check (case_ref ~ '^AP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$'),
  created_at            timestamptz not null default now(),
  status                text not null default 'new' check (status in ('new','contacted','intake_call','service_agreement','active','lost')),
  referrer_type         text not null check (referrer_type in ('self','family','coordinator','plan-manager','health-professional','other')),
  region                text not null check (region in ('central-coast','newcastle','dubbo','orange','tamworth','gunnedah','not-sure')),
  service_categories    text[] not null check (cardinality(service_categories) between 1 and 7),
  contact_method        text not null check (contact_method in ('phone','email','sms')),
  best_time             text check (char_length(best_time) <= 80),
  consent_notice_version text not null,
  consent_at            timestamptz not null,
  idempotency_key_hash  text not null unique
);

create table intake.person (
  id          uuid primary key,
  enquiry_id  uuid not null references intake.enquiry(id) on delete cascade,
  role        text not null check (role in ('enquirer','participant','representative')),
  name        text not null check (char_length(name) between 2 and 100),
  phone_e164  text check (phone_e164 ~ '^\+61[0-9]{9}$'),
  email       text check (char_length(email) <= 254)
);

-- C3. The *_enc columns must contain application-layer encryption envelopes (crypto.ts), never plaintext.
create table intake.participant_profile (
  person_id                uuid primary key references intake.person(id) on delete cascade,
  display_name             text,
  communication_preferences text,
  dob_enc                  text check (dob_enc is null or dob_enc ~ '^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$'),
  ndis_number_enc          text check (ndis_number_enc is null or ndis_number_enc ~ '^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$'),
  support_needs_enc        text check (support_needs_enc is null or support_needs_enc ~ '^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$'),
  updated_at               timestamptz not null default now()
);

create table intake.consent_record (
  id             uuid primary key,
  person_id      uuid not null references intake.person(id) on delete cascade,
  purpose        text not null,
  notice_version text not null,
  given_at       timestamptz not null,
  channel        text not null,
  withdrawn_at   timestamptz
);

create table intake.case_assignment (
  enquiry_id  uuid not null references intake.enquiry(id) on delete cascade,
  staff_id    uuid not null references intake.staff_user(id),
  assigned_at timestamptz not null default now(),
  primary key (enquiry_id, staff_id)
);

-- C4 metadata. The object key is generated (never derived from the filename); the file itself lives in private object storage.
create table intake.document (
  id                uuid primary key,
  enquiry_id        uuid not null references intake.enquiry(id) on delete cascade,
  object_key        text not null unique,
  original_filename text not null check (char_length(original_filename) <= 100 and original_filename !~ '[/\\]' and original_filename !~ '\.\.'),
  mime              text not null check (mime in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256            text check (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status       text not null default 'awaitingUpload' check (scan_status in ('awaitingUpload','quarantined','scanning','released','rejected','scanFailed','expired')),
  classification    text not null default 'C4',
  uploaded_by       text not null,
  created_at        timestamptz not null default now()
);

create table intake.case_event (
  id          uuid primary key,
  enquiry_id  uuid not null references intake.enquiry(id) on delete cascade,
  actor_id    uuid references intake.staff_user(id),
  type        text not null,
  at          timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')   -- no PII in meta (application-enforced)
);

create table intake.access_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null,
  role        text,
  action      text not null,
  entity      text,
  entity_id   text,
  outcome     text not null check (outcome in ('success','denied','error')),
  break_glass boolean not null default false,
  ip_hash     text,
  meta        jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')
);

create table intake.retention_job (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  rule_id     text not null,
  run_at      timestamptz not null default now(),
  result      text not null,
  executed_by uuid references intake.staff_user(id)
);

create index enquiry_region_idx on intake.enquiry (region);
create index case_assignment_staff_idx on intake.case_assignment (staff_id);
create index document_enquiry_idx on intake.document (enquiry_id);

-- ---------------------------------------------------------------------------------------------
-- Append-only audit log: no UPDATE, DELETE or TRUNCATE, enforced by privileges AND triggers.
-- ---------------------------------------------------------------------------------------------
create function intake.reject_modification() returns trigger
  language plpgsql as $$ begin raise exception 'intake.access_log is append-only'; end $$;

create trigger access_log_no_update_delete before update or delete on intake.access_log
  for each row execute function intake.reject_modification();
create trigger access_log_no_truncate before truncate on intake.access_log
  for each statement execute function intake.reject_modification();

-- Document lifecycle mirrors uploads.ts: only these transitions are legal; 'released' is terminal.
create function intake.enforce_document_transition() returns trigger
  language plpgsql as $$
begin
  if new.scan_status = old.scan_status then return new; end if;
  if (old.scan_status, new.scan_status) in (
       ('awaitingUpload','quarantined'), ('awaitingUpload','expired'),
       ('quarantined','scanning'), ('quarantined','rejected'),
       ('scanning','released'), ('scanning','rejected'), ('scanning','scanFailed'),
       ('scanFailed','scanning'), ('scanFailed','rejected')) then
    return new;
  end if;
  raise exception 'illegal document state transition % -> %', old.scan_status, new.scan_status;
end $$;

create trigger document_state_transition before update of scan_status on intake.document
  for each row execute function intake.enforce_document_transition();

-- A document may be downloaded only when it has been scanned clean and released.
create function intake.downloadable_object_key(p_document uuid) returns text
  language sql stable as $$ select d.object_key from intake.document d where d.id = p_document and d.scan_status = 'released' $$;

-- ---------------------------------------------------------------------------------------------
-- Row level security: enabled AND forced on every table. A table with no matching policy denies access.
-- ---------------------------------------------------------------------------------------------
alter table intake.staff_user         enable row level security;  alter table intake.staff_user         force row level security;
alter table intake.enquiry            enable row level security;  alter table intake.enquiry            force row level security;
alter table intake.person             enable row level security;  alter table intake.person             force row level security;
alter table intake.participant_profile enable row level security; alter table intake.participant_profile force row level security;
alter table intake.consent_record     enable row level security;  alter table intake.consent_record     force row level security;
alter table intake.case_assignment    enable row level security;  alter table intake.case_assignment    force row level security;
alter table intake.document           enable row level security;  alter table intake.document           force row level security;
alter table intake.case_event         enable row level security;  alter table intake.case_event         force row level security;
alter table intake.access_log         enable row level security;  alter table intake.access_log         force row level security;
alter table intake.retention_job      enable row level security;  alter table intake.retention_job      force row level security;

revoke all on all tables in schema intake from public;

-- staff_user: own row; system administrators manage users (no data access).
create policy staff_user_self on intake.staff_user for select to app_staff_api
  using (id = intake.current_staff() or intake.current_app_role() = 'system_administrator');
create policy staff_user_admin_write on intake.staff_user for all to app_staff_api
  using (intake.current_app_role() = 'system_administrator') with check (intake.current_app_role() = 'system_administrator');

-- case_assignment: a staff member sees their own assignments; managers/admins/compliance see and (managers) manage all.
create policy assignment_read on intake.case_assignment for select to app_staff_api
  using (staff_id = intake.current_staff() or intake.current_app_role() in ('intake_administrator','intake_manager','compliance_officer'));
create policy assignment_manage on intake.case_assignment for all to app_staff_api
  using (intake.current_app_role() = 'intake_manager') with check (intake.current_app_role() = 'intake_manager');

-- enquiry
create policy enquiry_public_insert on intake.enquiry for insert to app_public_intake
  with check (status = 'new');
create policy enquiry_read on intake.enquiry for select to app_staff_api using (
     intake.current_app_role() in ('intake_administrator','intake_manager','compliance_officer')
  or (intake.current_app_role() = 'intake_staff'
        and exists (select 1 from intake.case_assignment a where a.enquiry_id = enquiry.id and a.staff_id = intake.current_staff()))
  or (intake.current_app_role() = 'regional_staff'
        and region = any (intake.current_regions())
        and exists (select 1 from intake.case_assignment a where a.enquiry_id = enquiry.id and a.staff_id = intake.current_staff()))
  or intake.break_glass_active()
);
create policy enquiry_update on intake.enquiry for update to app_staff_api
  using (intake.current_app_role() in ('intake_administrator','intake_manager')
         or (intake.current_app_role() = 'intake_staff'
             and exists (select 1 from intake.case_assignment a where a.enquiry_id = enquiry.id and a.staff_id = intake.current_staff())))
  with check (true);
create policy enquiry_retention_delete on intake.enquiry for delete to app_staff_api
  using (intake.current_app_role() = 'compliance_officer');   -- executed only after approval, by the retention job

-- person: visible only when the parent enquiry is visible to the caller (the subquery is itself subject to enquiry RLS).
create policy person_public_insert on intake.person for insert to app_public_intake with check (role = 'enquirer');
create policy person_read on intake.person for select to app_staff_api using (
  (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff','compliance_officer') or intake.break_glass_active())
  and exists (select 1 from intake.enquiry e where e.id = person.enquiry_id)
);
create policy person_write on intake.person for all to app_staff_api
  using (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff') and exists (select 1 from intake.enquiry e where e.id = person.enquiry_id))
  with check (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff'));

-- participant_profile (C3): regional staff and marketing have NO direct policy; regional staff use the function below.
create policy profile_read on intake.participant_profile for select to app_staff_api using (
  (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff','compliance_officer') or intake.break_glass_active())
  and exists (select 1 from intake.person p where p.id = participant_profile.person_id)
);
create policy profile_write on intake.participant_profile for all to app_staff_api
  using (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff') and exists (select 1 from intake.person p where p.id = participant_profile.person_id))
  with check (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff'));

-- consent_record
create policy consent_public_insert on intake.consent_record for insert to app_public_intake with check (true);
create policy consent_read on intake.consent_record for select to app_staff_api using (
  (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff','compliance_officer') or intake.break_glass_active())
  and exists (select 1 from intake.person p where p.id = consent_record.person_id)
);

-- document (C4): regional staff and marketing have no policy. Managers read only; compliance reads (audit purpose).
create policy document_read on intake.document for select to app_staff_api using (
  (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff','compliance_officer') or intake.break_glass_active())
  and exists (select 1 from intake.enquiry e where e.id = document.enquiry_id)
);
create policy document_insert on intake.document for insert to app_staff_api
  with check (intake.current_app_role() in ('intake_administrator','intake_staff') and exists (select 1 from intake.enquiry e where e.id = document.enquiry_id));
create policy document_scan_update on intake.document for update to app_scanner using (true) with check (true);
grant update (scan_status) on intake.document to app_scanner;
grant select (id, scan_status) on intake.document to app_scanner;
create policy document_scan_select on intake.document for select to app_scanner using (true);

-- case_event
create policy case_event_public_insert on intake.case_event for insert to app_public_intake with check (actor_id is null);
create policy case_event_read on intake.case_event for select to app_staff_api using (
  (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff','regional_staff','compliance_officer') or intake.break_glass_active())
  and exists (select 1 from intake.enquiry e where e.id = case_event.enquiry_id)
);
create policy case_event_insert on intake.case_event for insert to app_staff_api
  with check (intake.current_app_role() in ('intake_administrator','intake_manager','intake_staff'));

-- access_log: anyone may append; only compliance officers may read; nobody may change or remove.
create policy access_log_insert on intake.access_log for insert to app_staff_api, app_public_intake with check (true);
create policy access_log_read on intake.access_log for select to app_staff_api using (intake.current_app_role() = 'compliance_officer');
revoke update, delete, truncate on intake.access_log from public;

-- retention_job: compliance officers only.
create policy retention_job_all on intake.retention_job for all to app_staff_api
  using (intake.current_app_role() = 'compliance_officer') with check (intake.current_app_role() = 'compliance_officer');

-- ---------------------------------------------------------------------------------------------
-- SECURITY DEFINER helpers (owner intake_definer has BYPASSRLS; each function re-implements its own check)
-- ---------------------------------------------------------------------------------------------

-- Regional staff: need-to-know fields only, for cases assigned to them in their regions. No DOB, NDIS number or support needs.
create function intake.regional_participant_view()
  returns table (case_ref text, display_name text, region text, services text[], communication_preferences text, contact_method text)
  language sql stable security definer set search_path = '' as $$
    select e.case_ref, pp.display_name, e.region, e.service_categories, pp.communication_preferences, e.contact_method
      from intake.enquiry e
      join intake.person p on p.enquiry_id = e.id and p.role = 'participant'
      left join intake.participant_profile pp on pp.person_id = p.id
     where intake.current_app_role() = 'regional_staff'
       and e.region = any (intake.current_regions())
       and exists (select 1 from intake.case_assignment a where a.enquiry_id = e.id and a.staff_id = intake.current_staff())
  $$;

-- Aggregates for marketing and managers: weekly counts by region and service with small-number suppression (< 5 hidden).
create function intake.enquiry_counts()
  returns table (week date, region text, service text, enquiries bigint)
  language sql stable security definer set search_path = '' as $$
    select date_trunc('week', e.created_at)::date, e.region, s.service, count(*)
      from intake.enquiry e cross join lateral unnest(e.service_categories) as s(service)
     where intake.current_app_role() in ('marketing_staff','intake_administrator','intake_manager','compliance_officer')
     group by 1, 2, 3
    having count(*) >= 5
  $$;

alter function intake.regional_participant_view() owner to intake_definer;
alter function intake.enquiry_counts() owner to intake_definer;
grant select on intake.enquiry, intake.person, intake.participant_profile, intake.case_assignment to intake_definer;

-- ---------------------------------------------------------------------------------------------
-- Grants (policies narrow these further)
-- ---------------------------------------------------------------------------------------------
grant usage on schema intake to app_public_intake, app_staff_api, app_scanner, intake_definer;
grant insert on intake.enquiry, intake.person, intake.consent_record, intake.case_event, intake.access_log to app_public_intake;
grant select, insert, update, delete on intake.staff_user, intake.enquiry, intake.person, intake.participant_profile, intake.consent_record,
      intake.case_assignment, intake.document, intake.case_event, intake.retention_job to app_staff_api;
grant select, insert on intake.access_log to app_staff_api;
grant execute on function intake.regional_participant_view(), intake.enquiry_counts(), intake.downloadable_object_key(uuid) to app_staff_api;

commit;
