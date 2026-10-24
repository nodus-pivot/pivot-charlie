-- Pivot Charlie: baseline schema (v2, Oct 23 2026).
--
-- Replaces the nine migrations of the first build. The seven-step flow from
-- the design handoff: Check in → Inspect → Supply → Repair → Test → Payment →
-- Ship → Closed. Every step is one row in ticket_steps (answer, notes, done).
-- No catalog: the watch is text, parts are a free-text list. Every Slack post
-- and email is a ticket_messages row. Parked / waiting / awaiting payment are
-- computed in the ticket_board view, never stored.

create extension if not exists citext;
create schema if not exists app;

-- ================================================================ enums
create type member_role as enum ('owner', 'admin', 'brand_rep', 'watchmaker');
create type stage as enum ('check_in', 'inspect', 'supply', 'repair', 'test', 'payment', 'ship', 'closed');
create type coverage as enum ('warranty', 'paid');
create type ticket_source as enum ('sheet', 'by_hand');
create type test_kind as enum ('time', 'water', 'looks');
create type test_result as enum ('pass', 'fail');
create type photo_kind as enum ('customer', 'bench');
create type sheet_row_status as enum ('imported', 'dismissed');
create type writeback_status as enum ('pending', 'done', 'failed');
create type message_channel as enum ('slack', 'email');
create type message_kind as enum ('parts_needed', 'cannot_replicate', 'received', 'shipped');
create type message_status as enum ('logged', 'sent', 'failed');

-- ================================================================ helpers
create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ================================================================ tenancy & people
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ticket_prefix text not null,
  bench_address jsonb,
  fulfillment_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger workspaces_updated_at before update on workspaces
  for each row execute function app.set_updated_at();

create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  name text not null,
  slug text not null,
  slack_channel_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
create trigger brands_updated_at before update on brands
  for each row execute function app.set_updated_at();

-- id equals auth.users.id. Accounts are created by an admin through the
-- Auth admin API, then a profile and memberships are inserted.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on profiles
  for each row execute function app.set_updated_at();

-- A person holds any number of memberships: owner (global), admin (one
-- workspace), brand_rep / watchmaker (one brand). Permissions are the union.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null,
  workspace_id uuid references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint memberships_scope check (
    (role = 'owner' and workspace_id is null and brand_id is null)
    or (role = 'admin' and workspace_id is not null and brand_id is null)
    or (role in ('brand_rep', 'watchmaker') and brand_id is not null and workspace_id is null)
  ),
  constraint memberships_unique unique nulls not distinct (user_id, role, workspace_id, brand_id)
);
create index memberships_user on memberships (user_id);
create index memberships_brand on memberships (brand_id) where brand_id is not null;
create index memberships_workspace on memberships (workspace_id) where workspace_id is not null;

-- ================================================================ sheet ledger
-- Every Incoming Watches row Pivot has acted on. The Incoming page reads the
-- live sheet and hides fingerprints present here. moved_at null means the
-- database side committed but the sheet move did not finish: retry it.
create table sheet_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  fingerprint text not null unique,
  source_tab text not null,
  raw jsonb not null,
  status sheet_row_status not null,
  moved_to_tab text,
  moved_at timestamptz,
  reason text,
  acted_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ================================================================ tickets
-- Intake data plus the stage pointer. Everything a step records lives in
-- ticket_steps; payment and shipping facts stay here because the dossier,
-- the bench and the public status page read them directly.
create table tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  workspace_id uuid not null references workspaces(id),
  brand_id uuid not null references brands(id),
  watch text not null,
  stage stage not null default 'check_in',
  source ticket_source not null default 'by_hand',
  sheet_row_id uuid unique references sheet_rows(id),
  claim_ref text,
  created_by uuid references profiles(id),
  closed_at timestamptz,

  customer_name text not null,
  customer_email citext,
  customer_phone text,
  ship_to jsonb,
  serial text,
  issue text,
  bench_note text,

  coverage coverage,
  priority boolean not null default false,
  needs_payment boolean not null default false,
  payment_amount numeric(10,2),
  invoice_sent_at timestamptz,
  return_to_everett boolean not null default false,

  test_attempt int not null default 1,
  ship_carrier text,
  ship_tracking text,
  label_url text,

  search tsvector generated always as (
    to_tsvector('simple',
      coalesce(number, '') || ' ' || coalesce(customer_name, '') || ' ' ||
      coalesce(customer_email::text, '') || ' ' || coalesce(watch, '') || ' ' ||
      coalesce(serial, '') || ' ' || coalesce(issue, ''))
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_workspace_stage on tickets (workspace_id, stage);
create index tickets_brand on tickets (brand_id);
create index tickets_search on tickets using gin (search);
create trigger tickets_updated_at before update on tickets
  for each row execute function app.set_updated_at();

-- One row per step per ticket, created with the ticket. The meaning of
-- `answer` and `notes` per step:
--   check_in  answer = I have the watch                    done = received
--   inspect   answer = reported issue present (No parks)   notes = comments
--   supply    answer = have the parts (No = list + Slack)  notes = parts list   done = had or received
--   repair    answer = repair complete                     notes = what you did
--   test      answer = all three pass (ticket_tests)       notes = test notes
--   payment   answer = payment received                    skipped = warranty
--   ship      done = shipped
create table ticket_steps (
  ticket_id uuid not null references tickets(id) on delete cascade,
  stage stage not null,
  answer boolean,
  notes text,
  done_at timestamptz,
  done_by uuid references profiles(id),
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (ticket_id, stage),
  constraint ticket_steps_open_stage check (stage <> 'closed')
);
create trigger ticket_steps_updated_at before update on ticket_steps
  for each row execute function app.set_updated_at();

-- Every outbound Slack post and customer email. Emails stay `logged` until a
-- mailer is switched on; Slack rows carry the message ts and reply count.
create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  channel message_channel not null,
  kind message_kind not null,
  recipient text,
  subject text,
  body text not null,
  status message_status not null default 'logged',
  error text,
  external_id text,
  reply_count int not null default 0,
  last_reply text,
  replies_checked_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket on ticket_messages (ticket_id, created_at);

-- Time / Water / Looks per attempt. A Fail sends the ticket back to Repair and
-- the next visit to Test starts a new attempt; earlier attempts stay.
create table ticket_tests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  attempt int not null default 1,
  kind test_kind not null,
  result test_result not null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (ticket_id, attempt, kind)
);

-- Paths into the private "photos" bucket: tickets/<ticket_id>/<file>.
create table ticket_photos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  kind photo_kind not null,
  storage_path text not null unique,
  sort int not null default 0,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index ticket_photos_ticket on ticket_photos (ticket_id, kind, sort);

-- Append-only timeline: created, stage_changed, sent_back, skipped, reopened,
-- comment, address_update_requested / _accepted / _declined, payment_override.
create table ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  type text not null,
  actor_id uuid references profiles(id),
  from_stage stage,
  to_stage stage,
  body text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket on ticket_events (ticket_id, created_at);

-- Pending cell updates to the ticket's month-tab row. Written only by the
-- stage machine and the payment trigger; drained by the app.
create table sheet_writebacks (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  column_name text not null,
  value text not null,
  status writeback_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index sheet_writebacks_pending on sheet_writebacks (created_at) where status = 'pending';

-- ================================================================ scope helpers
-- The caller's grants, possibly narrowed by "View as" headers. Owners and
-- admins may preview as a lesser role; headers can only narrow, never widen.
--   x-pivot-view-as:        brand_rep | watchmaker | admin
--   x-pivot-view-brand:     brand uuid (for brand_rep / watchmaker)
--   x-pivot-view-workspace: workspace uuid (for admin)
create or replace function app.effective_memberships()
returns table (role member_role, workspace_id uuid, brand_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  hdr json;
  v_as text;
  v_brand uuid;
  v_ws uuid;
  v_active boolean;
begin
  select is_active into v_active from profiles where id = auth.uid();
  if not coalesce(v_active, false) then return; end if;

  begin
    hdr := current_setting('request.headers', true)::json;
  exception when others then
    hdr := null;
  end;
  v_as := hdr ->> 'x-pivot-view-as';

  if v_as is null then
    return query select m.role, m.workspace_id, m.brand_id from memberships m where m.user_id = auth.uid();
    return;
  end if;

  v_brand := nullif(hdr ->> 'x-pivot-view-brand', '')::uuid;
  v_ws := nullif(hdr ->> 'x-pivot-view-workspace', '')::uuid;
  if v_as in ('brand_rep', 'watchmaker') and v_brand is not null then
    select b.workspace_id into v_ws from brands b where b.id = v_brand;
    if exists (select 1 from memberships m where m.user_id = auth.uid()
                and (m.role = 'owner' or (m.role = 'admin' and m.workspace_id = v_ws))) then
      return query select v_as::member_role, null::uuid, v_brand;
    end if;
    return;
  end if;
  if v_as = 'admin' and v_ws is not null then
    if exists (select 1 from memberships m where m.user_id = auth.uid()
                and (m.role = 'owner' or (m.role = 'admin' and m.workspace_id = v_ws))) then
      return query select 'admin'::member_role, v_ws, null::uuid;
    end if;
    return;
  end if;
  return;  -- malformed preview: fail closed
end $$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.effective_memberships() m where m.role = 'owner')
$$;

create or replace function app.workspace_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when app.is_owner() then (select coalesce(array_agg(id), '{}') from workspaces)
    else (select coalesce(array_agg(m.workspace_id), '{}') from app.effective_memberships() m where m.role = 'admin')
  end
$$;

create or replace function app.rep_brand_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.brand_id), '{}') from app.effective_memberships() m where m.role = 'brand_rep'
$$;

create or replace function app.bench_brand_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.brand_id), '{}') from app.effective_memberships() m where m.role = 'watchmaker'
$$;

create or replace function app.brand_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.brand_id), '{}') from app.effective_memberships() m where m.brand_id is not null
$$;

create or replace function app.visible_workspace_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct w), '{}') from (
    select unnest(app.workspace_ids()) as w
    union
    select b.workspace_id from brands b where b.id = any(app.brand_ids())
  ) s
$$;

create or replace function app.is_admin_of(p_workspace uuid) returns boolean
language sql stable as $$
  select p_workspace = any(app.workspace_ids())
$$;

create or replace function app.in_scope(p_workspace uuid, p_brand uuid) returns boolean
language sql stable as $$
  select p_workspace = any(app.workspace_ids()) or p_brand = any(app.brand_ids())
$$;

create or replace function app.ticket_in_scope(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tickets t where t.id = p_ticket and app.in_scope(t.workspace_id, t.brand_id))
$$;

-- May the caller work Incoming / create tickets in this workspace?
create or replace function app.can_intake(p_workspace uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_admin_of(p_workspace)
      or exists (select 1 from brands b where b.workspace_id = p_workspace and b.id = any(app.brand_ids()))
$$;

-- Stage ownership. Admins: everything. Watchmakers: every bench step.
-- Brand reps: Check in only. Reopen (closed) is owner/admin.
create or replace function app.can_act_on(p_stage stage, p_workspace uuid, p_brand uuid) returns boolean
language sql stable as $$
  select app.is_admin_of(p_workspace)
      or (p_brand = any(app.bench_brand_ids()) and p_stage <> 'closed')
      or (p_brand = any(app.rep_brand_ids()) and p_stage in ('check_in'))
$$;

-- People who share one of my visible workspaces (through any grant).
create or replace function app.user_in_scope(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from memberships m
    left join brands b on b.id = m.brand_id
    where m.user_id = p_user
      and (m.role = 'owner'
        or m.workspace_id = any(app.visible_workspace_ids())
        or b.workspace_id = any(app.visible_workspace_ids()))
  )
$$;

create or replace function app.membership_manageable(p_role member_role, p_workspace uuid, p_brand uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_owner()
      or (p_role in ('brand_rep', 'watchmaker')
          and exists (select 1 from brands b where b.id = p_brand and app.is_admin_of(b.workspace_id)))
$$;

create or replace function app.can_manage_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user <> auth.uid() and app.user_in_scope(p_user) and (
    app.is_owner()
    or not exists (
      select 1 from memberships m left join brands b on b.id = m.brand_id
      where m.user_id = p_user and not app.membership_manageable(m.role, m.workspace_id, m.brand_id)
    )
  )
$$;

-- Real grants, ignoring View-as, so the UI can offer "Exit preview".
create or replace function my_real_grants()
returns table (role member_role, workspace_id uuid, brand_id uuid)
language sql stable security definer set search_path = public as $$
  select m.role, m.workspace_id, m.brand_id from memberships m where m.user_id = auth.uid()
$$;

create or replace function admin_update_profile(p_user uuid, p_display_name text, p_is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.can_manage_user(p_user) then raise exception 'not allowed'; end if;
  update profiles set display_name = coalesce(p_display_name, display_name), is_active = coalesce(p_is_active, is_active)
   where id = p_user;
end $$;

-- A column REVOKE is a no-op while the table-level privilege stands. Correct
-- pattern: revoke the table privilege, grant it back per column.
create or replace function app.grant_columns_except(p_table regclass, p_privilege text, p_except text[])
returns void language plpgsql as $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ') into cols
    from pg_attribute
   where attrelid = p_table and attnum > 0 and not attisdropped and attname <> all(p_except);
  execute format('revoke %s on %s from authenticated', p_privilege, p_table);
  execute format('grant %s (%s) on %s to authenticated', p_privilege, cols, p_table);
end $$;

-- ================================================================ integrity triggers
create or replace function app.ticket_brand_guard() returns trigger
language plpgsql as $$
declare b uuid;
begin
  select workspace_id into b from brands where id = new.brand_id;
  if b <> new.workspace_id then raise exception 'brand must belong to the ticket''s workspace'; end if;
  return new;
end $$;
create trigger tickets_brand_guard before insert or update of brand_id, workspace_id on tickets
  for each row execute function app.ticket_brand_guard();

-- ================================================================ write-back queue
create or replace function app.queue_writeback(p_ticket uuid, p_column text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tickets t where t.id = p_ticket and t.sheet_row_id is not null) then
    return;  -- by-hand tickets have no sheet row
  end if;
  insert into sheet_writebacks (ticket_id, column_name, value) values (p_ticket, p_column, p_value);
end $$;

-- Payment Received? follows the payment step's answer.
create or replace function app.payment_step_writeback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'payment' and new.answer is distinct from old.answer then
    perform app.queue_writeback(new.ticket_id, 'Payment Received?', case when new.answer then 'TRUE' else 'FALSE' end);
  end if;
  return new;
end $$;
create trigger ticket_steps_payment_writeback after update of answer on ticket_steps
  for each row execute function app.payment_step_writeback();

-- ================================================================ stage machine
-- Four doors to tickets.stage: advance, send_back, skip_to_ship, reopen.
-- Scope, ownership and every gate live here; the UI only mirrors them.

create or replace function app.stage_order() returns stage[]
language sql immutable as $$
  select '{check_in,inspect,supply,repair,test,payment,ship,closed}'::stage[]
$$;

create or replace function app.mark_step_done(p_ticket uuid, p_stage stage, p_skipped boolean default false)
returns void language sql security definer set search_path = public as $$
  update ticket_steps
     set done_at = coalesce(done_at, now()),
         done_by = coalesce(done_by, auth.uid()),
         skipped = p_skipped
   where ticket_id = p_ticket and stage = p_stage
$$;

-- Forward one step. The gate is the current step's row plus its own rule.
-- Test → Payment skips straight to Ship on a warranty ticket.
create or replace function advance(p_ticket uuid, p_override boolean default false)
returns stage language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  s ticket_steps%rowtype;
  v_order stage[] := app.stage_order();
  v_ix int;
  v_to stage;
  v_passes int;
  v_payload jsonb := null;
begin
  select * into t from tickets where id = p_ticket for update;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not app.in_scope(t.workspace_id, t.brand_id) then raise exception 'ticket not in your scope'; end if;
  if t.stage = 'closed' then raise exception 'the ticket is closed; reopen it first'; end if;
  if not app.can_act_on(t.stage, t.workspace_id, t.brand_id) then raise exception 'your role does not own the % step', t.stage; end if;

  select * into s from ticket_steps where ticket_id = p_ticket and stage = t.stage;
  if s.ticket_id is null then raise exception 'step row missing for %', t.stage; end if;

  if t.stage = 'check_in' then
    if not coalesce(s.answer, false) then raise exception 'tick "I have the watch" first'; end if;
  elsif t.stage = 'inspect' then
    if s.answer is null then raise exception 'answer "Is the reported issue present?" first'; end if;
    if not s.answer then raise exception 'parked: pick Yes to continue, or skip to Ship'; end if;
    if coalesce(trim(s.notes), '') = '' then raise exception 'add your inspection comments first'; end if;
  elsif t.stage = 'supply' then
    if s.answer is null then raise exception 'answer "Do you have the parts?" first'; end if;
    if not s.answer and s.done_at is null then raise exception 'tick "Parts received" once everything is on the bench'; end if;
  elsif t.stage = 'repair' then
    if not coalesce(s.answer, false) then raise exception 'tick "Repair complete" first'; end if;
  elsif t.stage = 'test' then
    select count(*) into v_passes from ticket_tests x where x.ticket_id = p_ticket and x.attempt = t.test_attempt and x.result = 'pass';
    if v_passes < 3 then raise exception 'all three checks must pass'; end if;
  elsif t.stage = 'payment' then
    if t.needs_payment and not coalesce(s.answer, false) then
      if not (p_override and app.is_admin_of(t.workspace_id)) then raise exception 'payment has not been received'; end if;
      v_payload := '{"payment_override": true}'::jsonb;
    end if;
  elsif t.stage = 'ship' then
    if coalesce(trim(t.ship_tracking), '') = '' and coalesce(trim(t.label_url), '') = '' then
      raise exception 'generate a label or enter the tracking number';
    end if;
  end if;

  v_ix := array_position(v_order, t.stage);
  v_to := v_order[v_ix + 1];
  perform app.mark_step_done(p_ticket, t.stage, false);

  -- Warranty tickets never stop at Payment.
  if v_to = 'payment' and not t.needs_payment then
    perform app.mark_step_done(p_ticket, 'payment', true);
    v_to := 'ship';
  end if;

  update tickets set stage = v_to, closed_at = case when v_to = 'closed' then now() end where id = p_ticket;
  insert into ticket_events (ticket_id, type, actor_id, from_stage, to_stage, payload)
  values (p_ticket, 'stage_changed', auth.uid(), t.stage, v_to, v_payload);
  if v_payload is not null then
    insert into ticket_events (ticket_id, type, actor_id, body) values (p_ticket, 'payment_override', auth.uid(), 'Shipped unpaid on an owner override');
  end if;

  if t.stage = 'inspect' then
    perform app.queue_writeback(p_ticket, 'Solution', left(s.notes, 2000));
  elsif t.stage = 'repair' then
    perform app.queue_writeback(p_ticket, 'Repair Completed?', 'TRUE');
  elsif t.stage = 'ship' then
    perform app.queue_writeback(p_ticket, 'Shipped Back?', 'TRUE');
  end if;
  return v_to;
end $$;

-- Back to an earlier open step. Clears done_at from that step on; Test →
-- Repair starts the next test attempt.
create or replace function send_back(p_ticket uuid, p_to stage)
returns void language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  v_order stage[] := app.stage_order();
  v_from_ix int;
  v_to_ix int;
begin
  select * into t from tickets where id = p_ticket for update;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not app.in_scope(t.workspace_id, t.brand_id) then raise exception 'ticket not in your scope'; end if;
  if t.stage = 'closed' then raise exception 'reopen a closed ticket instead'; end if;
  if not app.can_act_on(t.stage, t.workspace_id, t.brand_id) then raise exception 'your role does not own the % step', t.stage; end if;
  v_from_ix := array_position(v_order, t.stage);
  v_to_ix := array_position(v_order, p_to);
  if v_to_ix is null or v_to_ix >= v_from_ix then raise exception 'send back must move to an earlier step'; end if;

  update ticket_steps set done_at = null, done_by = null, skipped = false
   where ticket_id = p_ticket and array_position(v_order, stage) >= v_to_ix;
  if t.stage = 'test' and p_to = 'repair' then
    update tickets set test_attempt = test_attempt + 1 where id = p_ticket;
    update ticket_steps set answer = null where ticket_id = p_ticket and stage = 'repair';
  end if;
  update tickets set stage = p_to where id = p_ticket;
  insert into ticket_events (ticket_id, type, actor_id, from_stage, to_stage)
  values (p_ticket, 'sent_back', auth.uid(), t.stage, p_to);
end $$;

-- "Nothing wrong · skip to Ship" from Inspect. Supply, Repair and Test are
-- marked skipped; Payment too unless the ticket needs payment.
create or replace function skip_to_ship(p_ticket uuid)
returns stage language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  s ticket_steps%rowtype;
  v_to stage := 'ship';
begin
  select * into t from tickets where id = p_ticket for update;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not app.in_scope(t.workspace_id, t.brand_id) then raise exception 'ticket not in your scope'; end if;
  if t.stage <> 'inspect' then raise exception 'skip to Ship is only offered on Inspect'; end if;
  if not app.can_act_on('inspect', t.workspace_id, t.brand_id) then raise exception 'your role does not own the inspect step'; end if;
  select * into s from ticket_steps where ticket_id = p_ticket and stage = 'inspect';
  if coalesce(trim(s.notes), '') = '' then raise exception 'add your inspection comments first'; end if;

  perform app.mark_step_done(p_ticket, 'inspect', false);
  perform app.mark_step_done(p_ticket, 'supply', true);
  perform app.mark_step_done(p_ticket, 'repair', true);
  perform app.mark_step_done(p_ticket, 'test', true);
  if t.needs_payment then v_to := 'payment'; else perform app.mark_step_done(p_ticket, 'payment', true); end if;

  update tickets set stage = v_to where id = p_ticket;
  insert into ticket_events (ticket_id, type, actor_id, from_stage, to_stage, body)
  values (p_ticket, 'skipped', auth.uid(), 'inspect', v_to, 'Nothing wrong: skipped Supply, Repair and Test');
  perform app.queue_writeback(p_ticket, 'Solution', 'Nothing wrong. ' || left(s.notes, 1900));
  perform app.queue_writeback(p_ticket, 'Repair Completed?', 'TRUE');
  return v_to;
end $$;

-- Closed → Ship, owners and admins only.
create or replace function reopen(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype;
begin
  select * into t from tickets where id = p_ticket for update;
  if t.id is null then raise exception 'ticket not found'; end if;
  if t.stage <> 'closed' then raise exception 'only a closed ticket can be reopened'; end if;
  if not app.is_admin_of(t.workspace_id) then raise exception 'reopen is for owners and admins'; end if;
  update ticket_steps set done_at = null, done_by = null where ticket_id = p_ticket and stage = 'ship';
  update tickets set stage = 'ship', closed_at = null where id = p_ticket;
  insert into ticket_events (ticket_id, type, actor_id, from_stage, to_stage)
  values (p_ticket, 'reopened', auth.uid(), 'closed', 'ship');
end $$;

-- ================================================================ create_ticket
-- The one way a ticket comes into being. Assigns the number (prefix + YY +
-- 4 digits, per workspace and year), writes the optional sheet ledger row,
-- the ticket, its seven step rows and the 'created' event in one transaction.
create or replace function create_ticket(p jsonb)
returns table (id uuid, number text)
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := (p ->> 'workspace_id')::uuid;
  v_brand uuid := (p ->> 'brand_id')::uuid;
  v_prefix text;
  v_yy text := to_char(now() at time zone 'America/Los_Angeles', 'YY');
  v_seq int;
  v_number text;
  v_sheet_row uuid;
  v_id uuid;
  v_source ticket_source;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not app.can_intake(v_ws) then raise exception 'not allowed to create tickets here'; end if;
  if not (app.is_admin_of(v_ws) or v_brand = any(app.brand_ids())) then raise exception 'not allowed for this brand'; end if;
  if not exists (select 1 from brands b where b.id = v_brand and b.workspace_id = v_ws) then raise exception 'brand is not in this workspace'; end if;
  if coalesce(trim(p ->> 'customer_name'), '') = '' then raise exception 'customer name is required'; end if;
  if coalesce(trim(p ->> 'watch'), '') = '' then raise exception 'which watch is it?'; end if;

  select ticket_prefix into v_prefix from workspaces where workspaces.id = v_ws;

  -- One number sequence per prefix and year; the lock serialises concurrent creates.
  perform pg_advisory_xact_lock(hashtext(v_prefix || v_yy));
  select coalesce(max(substring(t.number from length(v_prefix || v_yy) + 1)::int), 0) + 1 into v_seq
    from tickets t
   where t.number ~ ('^' || v_prefix || v_yy || '[0-9]{4}$');
  v_number := v_prefix || v_yy || lpad(v_seq::text, 4, '0');

  if p ? 'sheet_row' and p -> 'sheet_row' is not null and jsonb_typeof(p -> 'sheet_row') = 'object' then
    insert into sheet_rows (workspace_id, fingerprint, source_tab, raw, status, acted_by)
    values (v_ws, p -> 'sheet_row' ->> 'fingerprint', p -> 'sheet_row' ->> 'source_tab', coalesce(p -> 'sheet_row' -> 'raw', '{}'::jsonb), 'imported', auth.uid())
    returning sheet_rows.id into v_sheet_row;
  end if;
  v_source := coalesce((p ->> 'source')::ticket_source, (case when v_sheet_row is null then 'by_hand' else 'sheet' end)::ticket_source);

  insert into tickets (
    number, workspace_id, brand_id, watch, source, sheet_row_id, claim_ref, created_by,
    customer_name, customer_email, customer_phone, ship_to, serial, issue, bench_note,
    coverage, priority, needs_payment, payment_amount, return_to_everett
  ) values (
    v_number, v_ws, v_brand, trim(p ->> 'watch'), v_source,
    v_sheet_row, nullif(trim(p ->> 'claim_ref'), ''), auth.uid(),
    trim(p ->> 'customer_name'), nullif(lower(trim(p ->> 'customer_email')), '')::citext, nullif(trim(p ->> 'customer_phone'), ''),
    case when p ? 'ship_to' and jsonb_typeof(p -> 'ship_to') = 'object' then p -> 'ship_to' end,
    nullif(trim(p ->> 'serial'), ''), nullif(trim(p ->> 'issue'), ''), nullif(trim(p ->> 'bench_note'), ''),
    nullif(p ->> 'coverage', '')::coverage,
    coalesce((p ->> 'priority')::boolean, false),
    coalesce((p ->> 'needs_payment')::boolean, false),
    nullif(p ->> 'payment_amount', '')::numeric,
    coalesce((p ->> 'return_to_everett')::boolean, false)
  ) returning tickets.id into v_id;

  insert into ticket_steps (ticket_id, stage, answer)
  select v_id, s, case when s = 'check_in' and coalesce((p ->> 'on_bench')::boolean, false) then true end
    from unnest(app.stage_order()) s where s <> 'closed';

  insert into ticket_events (ticket_id, type, actor_id, to_stage, payload)
  values (v_id, 'created', auth.uid(), 'check_in', jsonb_build_object('source', v_source));

  return query select v_id, v_number;
end $$;

-- ================================================================ board view
-- What the bench and the closed list read: one row per ticket with the
-- derived state the cards show. security_invoker so ticket RLS applies.
create view ticket_board with (security_invoker = true) as
select
  t.id, t.number, t.workspace_id, t.brand_id, t.stage, t.source,
  t.customer_name, t.watch, t.priority, t.needs_payment, t.payment_amount, t.invoice_sent_at,
  t.return_to_everett, t.coverage, t.test_attempt, t.created_at, t.closed_at,
  ci.done_at as received_at,
  coalesce(e.entered_at, t.created_at) as stage_entered_at,
  (t.stage = 'inspect' and ins.answer = false) as parked,
  (t.stage = 'supply' and sup.answer = false and sup.done_at is null and pm.requested_at is not null) as waiting_for_parts,
  pm.requested_at as parts_requested_at,
  sup.notes as parts_list,
  (t.stage = 'payment' and t.needs_payment and pay.answer is distinct from true) as awaiting_payment,
  coalesce(pay.answer, false) as payment_received,
  (select count(*) from ticket_tests x where x.ticket_id = t.id and x.attempt = t.test_attempt and x.result = 'pass')::int as tests_passed,
  (coalesce(trim(t.ship_tracking), '') <> '' or coalesce(trim(t.label_url), '') <> '') as ship_ready,
  case when rep.skipped then 'nothing wrong' else nullif(trim(rep.notes), '') end as outcome,
  lm.reply_count as slack_replies,
  lm.kind as slack_kind,
  (select ph.storage_path from ticket_photos ph where ph.ticket_id = t.id order by (ph.kind = 'bench') desc, ph.sort, ph.created_at limit 1) as bench_photo_path,
  (select p.display_name from ticket_steps sh join profiles p on p.id = sh.done_by where sh.ticket_id = t.id and sh.stage = 'ship') as shipped_by
from tickets t
left join ticket_steps ci on ci.ticket_id = t.id and ci.stage = 'check_in'
left join ticket_steps ins on ins.ticket_id = t.id and ins.stage = 'inspect'
left join ticket_steps sup on sup.ticket_id = t.id and sup.stage = 'supply'
left join ticket_steps rep on rep.ticket_id = t.id and rep.stage = 'repair'
left join ticket_steps pay on pay.ticket_id = t.id and pay.stage = 'payment'
left join lateral (
  select max(m.created_at) as requested_at from ticket_messages m
   where m.ticket_id = t.id and m.kind = 'parts_needed' and m.channel = 'slack'
) pm on true
left join lateral (
  select m.reply_count, m.kind from ticket_messages m
   where m.ticket_id = t.id and m.channel = 'slack'
   order by m.created_at desc limit 1
) lm on true
left join lateral (
  select ev.created_at as entered_at from ticket_events ev
   where ev.ticket_id = t.id and ev.to_stage = t.stage and ev.type in ('stage_changed', 'sent_back', 'skipped', 'reopened', 'created')
   order by ev.created_at desc limit 1
) e on true;

-- ================================================================ public status (Check a repair)
-- Two definer functions open to anonymous callers. Both need the ticket
-- number AND the customer's email; the response is a customer-safe view.
create or replace function customer_ticket_status(p_number text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  v_entered jsonb;
  v_received timestamptz;
  v_shipped timestamptz;
begin
  if p_number is null or p_email is null then return null; end if;
  select * into t from tickets
   where upper(trim(number)) = upper(trim(p_number)) and customer_email = lower(trim(p_email))::citext;
  if t.id is null then return null; end if;

  select done_at into v_received from ticket_steps where ticket_id = t.id and stage = 'check_in';
  select done_at into v_shipped from ticket_steps where ticket_id = t.id and stage = 'ship';

  -- First time each stage was entered, from the timeline.
  select jsonb_object_agg(stage, at) into v_entered from (
    select to_stage::text as stage, min(created_at) as at
      from ticket_events
     where ticket_id = t.id and to_stage is not null and type in ('created', 'stage_changed', 'sent_back', 'skipped', 'reopened')
     group by to_stage
  ) s;

  return jsonb_build_object(
    'number', t.number,
    'watch', t.watch,
    'first_name', split_part(trim(t.customer_name), ' ', 1),
    'submitted_at', t.created_at,
    'stage', t.stage,
    'entered', coalesce(v_entered, '{}'::jsonb),
    'received_at', v_received,
    'shipped_at', v_shipped,
    'closed_at', t.closed_at,
    'needs_payment', t.needs_payment,
    'carrier', t.ship_carrier,
    'tracking', case when t.stage = 'closed' then t.ship_tracking end,
    'return_to_everett', t.return_to_everett,
    -- Only the part of the address a customer needs to recognise it. The street never leaves the database.
    'ship_to', case when t.ship_to is not null then jsonb_build_object('city', t.ship_to ->> 'city', 'state', t.ship_to ->> 'state', 'country', t.ship_to ->> 'country') end,
    'address_change_pending', exists (
      select 1 from ticket_events e where e.ticket_id = t.id and e.type = 'address_update_requested'
         and not exists (select 1 from ticket_events r where r.ticket_id = t.id and r.type in ('address_update_accepted', 'address_update_declined') and r.created_at > e.created_at)
    )
  );
end $$;

create or replace function customer_request_address_update(p_number text, p_email text, p_address jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_stage stage;
begin
  if p_number is null or p_email is null or p_address is null or jsonb_typeof(p_address) <> 'object' then return false; end if;
  select id, stage into v_id, v_stage from tickets
   where upper(trim(number)) = upper(trim(p_number)) and customer_email = lower(trim(p_email))::citext;
  if v_id is null then return false; end if;
  if v_stage = 'closed' then return false; end if;
  if coalesce(trim(p_address ->> 'line1'), '') = '' or coalesce(trim(p_address ->> 'city'), '') = '' then return false; end if;
  insert into ticket_events (ticket_id, type, body, payload)
  values (v_id, 'address_update_requested', 'Customer asked to change the return address',
          jsonb_build_object(
            'line1', left(trim(p_address ->> 'line1'), 200),
            'line2', left(trim(coalesce(p_address ->> 'line2', '')), 200),
            'city', left(trim(p_address ->> 'city'), 100),
            'state', left(trim(coalesce(p_address ->> 'state', '')), 50),
            'postal_code', left(trim(coalesce(p_address ->> 'postal_code', '')), 20),
            'country', left(trim(coalesce(p_address ->> 'country', '')), 60)));
  return true;
end $$;

-- ================================================================ row-level security
alter table workspaces enable row level security;
alter table brands enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table sheet_rows enable row level security;
alter table tickets enable row level security;
alter table ticket_steps enable row level security;
alter table ticket_messages enable row level security;
alter table ticket_tests enable row level security;
alter table ticket_photos enable row level security;
alter table ticket_events enable row level security;
alter table sheet_writebacks enable row level security;

create policy workspaces_read on workspaces for select to authenticated
  using (id = any(app.visible_workspace_ids()));
create policy workspaces_update on workspaces for update to authenticated
  using (app.is_admin_of(id)) with check (app.is_admin_of(id));
create policy workspaces_create on workspaces for insert to authenticated
  with check (app.is_owner());

create policy brands_read on brands for select to authenticated
  using (app.is_admin_of(workspace_id) or id = any(app.brand_ids()));
create policy brands_write on brands for all to authenticated
  using (app.is_admin_of(workspace_id)) with check (app.is_admin_of(workspace_id));

create policy profiles_read on profiles for select to authenticated
  using (app.user_in_scope(id));
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_read on memberships for select to authenticated
  using (user_id = auth.uid() or app.user_in_scope(user_id));
create policy memberships_insert on memberships for insert to authenticated
  with check (app.membership_manageable(role, workspace_id, brand_id) and created_by = auth.uid());
create policy memberships_delete on memberships for delete to authenticated
  using (app.membership_manageable(role, workspace_id, brand_id) and user_id <> auth.uid());

create policy sheet_rows_read on sheet_rows for select to authenticated
  using (app.can_intake(workspace_id));
create policy sheet_rows_insert on sheet_rows for insert to authenticated
  with check (app.can_intake(workspace_id) and acted_by = auth.uid());
create policy sheet_rows_update on sheet_rows for update to authenticated
  using (app.can_intake(workspace_id)) with check (app.can_intake(workspace_id));

create policy tickets_read on tickets for select to authenticated
  using (app.in_scope(workspace_id, brand_id));
create policy tickets_update on tickets for update to authenticated
  using (app.in_scope(workspace_id, brand_id)) with check (app.in_scope(workspace_id, brand_id));
create policy tickets_delete on tickets for delete to authenticated
  using (app.is_admin_of(workspace_id));

-- Step rows are created by create_ticket and never deleted by people.
create policy ticket_steps_read on ticket_steps for select to authenticated
  using (app.ticket_in_scope(ticket_id));
create policy ticket_steps_update on ticket_steps for update to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));

create policy ticket_messages_read on ticket_messages for select to authenticated
  using (app.ticket_in_scope(ticket_id));
create policy ticket_messages_insert on ticket_messages for insert to authenticated
  with check (app.ticket_in_scope(ticket_id) and created_by = auth.uid());
create policy ticket_messages_update on ticket_messages for update to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));

create policy ticket_tests_all on ticket_tests for all to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));
create policy ticket_photos_all on ticket_photos for all to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));

create policy ticket_events_read on ticket_events for select to authenticated
  using (app.ticket_in_scope(ticket_id));
create policy ticket_events_insert on ticket_events for insert to authenticated
  with check (app.ticket_in_scope(ticket_id) and actor_id = auth.uid());

-- The queue is read-only for people; the stage machine and the drainer
-- (service role) write it.
create policy sheet_writebacks_read on sheet_writebacks for select to authenticated
  using (app.ticket_in_scope(ticket_id));

-- ================================================================ column privileges
select app.grant_columns_except('tickets', 'update',
  array['stage', 'closed_at', 'number', 'workspace_id', 'brand_id', 'source', 'sheet_row_id', 'test_attempt', 'created_by', 'created_at', 'updated_at', 'search']);
select app.grant_columns_except('ticket_steps', 'update', array['ticket_id', 'stage', 'skipped', 'updated_at']);
select app.grant_columns_except('ticket_messages', 'update', array['id', 'ticket_id', 'channel', 'kind', 'created_by', 'created_at']);
select app.grant_columns_except('profiles', 'update', array['id', 'email', 'is_active', 'created_at', 'updated_at']);
select app.grant_columns_except('sheet_rows', 'update', array['id', 'workspace_id', 'fingerprint', 'raw', 'acted_by', 'created_at']);
revoke insert on tickets from authenticated;  -- create_ticket() is the only door

-- ================================================================ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- tickets/<ticket_id>/... follows the ticket.
create or replace function app.photo_path_allowed(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_id uuid;
begin
  parts := storage.foldername(p_name);
  if array_length(parts, 1) < 2 or parts[1] <> 'tickets' then return false; end if;
  begin v_id := parts[2]::uuid; exception when others then return false; end;
  return app.ticket_in_scope(v_id);
end $$;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and app.photo_path_allowed(name, false));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and app.photo_path_allowed(name, true));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and app.photo_path_allowed(name, true));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and app.photo_path_allowed(name, true));

-- ================================================================ grants
grant usage on schema app to authenticated, anon;
grant execute on all functions in schema app to authenticated;
revoke execute on function app.queue_writeback(uuid, text, text) from authenticated;
revoke execute on function app.mark_step_done(uuid, stage, boolean) from authenticated;
revoke execute on function app.payment_step_writeback() from authenticated;
revoke execute on function app.ticket_brand_guard() from authenticated;
grant execute on function advance(uuid, boolean) to authenticated;
grant execute on function send_back(uuid, stage) to authenticated;
grant execute on function skip_to_ship(uuid) to authenticated;
grant execute on function reopen(uuid) to authenticated;
grant execute on function create_ticket(jsonb) to authenticated;
grant execute on function my_real_grants() to authenticated;
grant execute on function admin_update_profile(uuid, text, boolean) to authenticated;
grant select on ticket_board to authenticated;
revoke all on function customer_ticket_status(text, text) from public;
revoke all on function customer_request_address_update(text, text, jsonb) from public;
grant execute on function customer_ticket_status(text, text) to anon, authenticated;
grant execute on function customer_request_address_update(text, text, jsonb) to anon, authenticated;
