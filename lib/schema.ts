// Idempotent: runs on every server start. Add new columns with `add column if not exists`.
export const SCHEMA = /* sql */ `
create table if not exists users (
  id            serial primary key,
  email         text not null unique,
  name          text not null,
  role          text not null check (role in ('admin', 'rep')),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  id         text primary key,
  user_id    int not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists pain_points (
  id    serial primary key,
  label text not null unique
);

create table if not exists leads (
  id               serial primary key,
  first_name       text not null default '',
  last_name        text not null default '',
  title            text not null default '',
  company          text not null default '',
  email            text not null default '',
  email_status     text not null default '',
  phone_work       text not null default '',
  phone_mobile     text not null default '',
  phone_company    text not null default '',
  linkedin_url     text not null default '',
  website          text not null default '',
  industry         text not null default '',
  employees        text not null default '',
  country          text not null default '',
  state            text not null default '',
  timezone         text not null default '',
  owner_id         int references users(id) on delete set null,
  status           text not null default 'Inactive'
                   check (status in ('Inactive', 'Active', 'Paused', 'Bad')),
  disposition      text not null default 'None'
                   check (disposition in ('None', 'Bounced', 'Requested to unsubscribe', 'Replied', 'Meeting booked')),
  pain_point       text not null default '',
  activated_on     date,
  callback_on      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists leads_owner_idx on leads(owner_id);
create unique index if not exists leads_email_uniq on leads(lower(email)) where email <> '';

-- The sequence template: an ordered list of steps, each on a channel, due N days after activation.
create table if not exists sequence_steps (
  id          serial primary key,
  position    int not null unique,
  step_number int not null,
  channel     text not null check (channel in ('Email', 'LinkedIn')),
  day_offset  int not null default 0,
  subject     text not null default '',
  body        text not null default ''
);

-- One row per lead per step, created when a lead is activated.
create table if not exists lead_steps (
  lead_id  int not null references leads(id) on delete cascade,
  step_id  int not null references sequence_steps(id) on delete cascade,
  due_on   date not null,
  sent_at  timestamptz,
  sent_by  int references users(id) on delete set null,
  primary key (lead_id, step_id)
);

-- Everything that happens to a lead: calls, notes, sent steps, assignments, status changes.
create table if not exists activities (
  id          serial primary key,
  lead_id     int not null references leads(id) on delete cascade,
  user_id     int references users(id) on delete set null,
  kind        text not null check (kind in ('call', 'note', 'step', 'assign', 'status', 'import', 'email')),
  outcome     text not null default '',
  phone       text not null default '',
  body        text not null default '',
  callback_on date,
  created_at  timestamptz not null default now()
);
create index if not exists activities_lead_idx on activities(lead_id, created_at desc);
create index if not exists activities_created_idx on activities(created_at);
create index if not exists activities_kind_idx on activities(kind, lead_id, created_at desc);

-- Added after launch: the full lead upload template. Six phone types like the old PROSPECT LIST,
-- the Step 1 channel plan, and every original column kept for "View all fields".
alter table leads add column if not exists phone_home text not null default '';
alter table leads add column if not exists phone_corporate text not null default '';
alter table leads add column if not exists phone_other text not null default '';
alter table leads add column if not exists city text not null default '';
alter table leads add column if not exists company_linkedin_url text not null default '';
alter table leads add column if not exists seniority text not null default '';
alter table leads add column if not exists departments text not null default '';
alter table leads add column if not exists channel_plan text not null default 'Email + LinkedIn';
alter table leads add column if not exists source_fields jsonb not null default '[]'::jsonb;

-- The job-title aligned version of each message; blank falls back to the general one.
alter table sequence_steps add column if not exists subject_titled text not null default '';
alter table sequence_steps add column if not exists body_titled text not null default '';

-- Duplicate checks. A lead is the same person when its email, contact ID or LinkedIn profile matches.
-- linkedin_key is the profile URL without protocol, www, query or trailing slash.
alter table leads add column if not exists contact_id text not null default '';
alter table leads add column if not exists linkedin_key text not null default '';
update leads set linkedin_key = regexp_replace(regexp_replace(split_part(lower(trim(linkedin_url)), '?', 1), '^https?://(www\\.|[a-z]{2}\\.)?', ''), '/+$', '')
 where linkedin_key = '' and lower(linkedin_url) like '%linkedin.com/in/%';
update leads set contact_id = coalesce((select f->>1 from jsonb_array_elements(source_fields) f
                                         where lower(f->>0) in ('contact id', 'apollo contact id') limit 1), '')
 where contact_id = '' and source_fields <> '[]'::jsonb;
-- Unique like email, created only when existing data allows it (never fail start-up over old duplicates).
do $$ begin
  if not exists (select 1 from leads where contact_id <> '' group by contact_id having count(*) > 1) then
    create unique index if not exists leads_contact_uniq on leads(contact_id) where contact_id <> '';
  end if;
  if not exists (select 1 from leads where linkedin_key <> '' group by linkedin_key having count(*) > 1) then
    create unique index if not exists leads_linkedin_uniq on leads(linkedin_key) where linkedin_key <> '';
  end if;
end $$;
-- Built for 100k+ leads: each lead stores its next action and its last call, kept current by every write
-- (lib/cache.ts), so lists filter and sort on indexed columns instead of recomputing every lead.
alter table leads add column if not exists step_due date;
alter table leads add column if not exists step_number int;
alter table leads add column if not exists step_channel text;
alter table leads add column if not exists next_due date;
alter table leads add column if not exists last_call_id int;
alter table leads add column if not exists last_call_at timestamptz;
alter table leads add column if not exists last_call_outcome text not null default '';
create index if not exists leads_owner_due_idx on leads(owner_id, next_due);
create index if not exists leads_next_due_idx on leads(next_due, last_name);
create index if not exists leads_name_idx on leads(last_name, first_name);
create index if not exists leads_unassigned_name_idx on leads(last_name, first_name) where owner_id is null;
create index if not exists leads_activated_idx on leads(activated_on);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_country_idx on leads(country);
create index if not exists leads_timezone_idx on leads(timezone);
create index if not exists leads_last_call_idx on leads(last_call_outcome, last_call_at desc);
create index if not exists activities_calls_idx on activities(created_at desc, id desc) where kind = 'call';
create index if not exists lead_steps_sent_idx on lead_steps(sent_at) where sent_at is not null;
-- Fast "contains" search on name, company, email and title (trigram index) where the database supports it.
do $$ begin
  create extension if not exists pg_trgm;
exception when others then null;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists leads_search_trgm on leads
      using gin ((lower(first_name || ' ' || last_name || ' ' || company || ' ' || email || ' ' || title)) gin_trgm_ops);
  end if;
end $$;

-- Pairs an admin marked "not duplicates", so they stop showing in the duplicates list.
create table if not exists duplicate_dismissals (
  lead_a int not null references leads(id) on delete cascade,
  lead_b int not null references leads(id) on delete cascade,
  primary key (lead_a, lead_b)
);

-- Emails sent from the CRM through Brevo: kind 'email', with the subject, the Brevo message ID (for bounce tracking later)
-- and, in outcome, the step it sent ("Step 2 · Email"; blank for a one-off email).
alter table activities add column if not exists subject text not null default '';
alter table activities add column if not exists message_id text not null default '';
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'activities_kind_check' and pg_get_constraintdef(oid) not like '%email%') then
    alter table activities drop constraint activities_kind_check;
    alter table activities add constraint activities_kind_check
      check (kind in ('call', 'note', 'step', 'assign', 'status', 'import', 'email'));
  end if;
end $$;

-- Email signature details each user sets for themselves (company website and address are settings).
alter table users add column if not exists title text not null default '';
alter table users add column if not exists phone text not null default '';

-- Admin-editable settings (daily limits). Blank value = no limit.
create table if not exists settings (
  key   text primary key,
  value text not null default ''
);
`;

export const LEAD_STATUSES = ["Inactive", "Active", "Paused", "Bad"] as const;
export const DISPOSITIONS = ["None", "Bounced", "Requested to unsubscribe", "Replied", "Meeting booked"] as const;
export const CALL_OUTCOMES = [
  "No answer",
  "Left voicemail",
  "Gatekeeper",
  "Wrong number",
  "Call back later",
  "Not interested",
  "Email requested",
  "Interested",
  "Meeting booked",
] as const;
export const CHANNEL_PLANS = ["Email + LinkedIn", "Email only"] as const;
/** Outcomes the app relies on by name: follow-up lists and the meeting disposition. */
export const REQUIRED_OUTCOMES = ["Interested", "Email requested", "Meeting booked"] as const;
export const MESSAGING_MODES = ["Job-title aligned", "General"] as const;
export type LeadStatus =(typeof LEAD_STATUSES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
