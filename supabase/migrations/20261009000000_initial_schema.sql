-- Pivot Charlie: initial schema.
--
-- One workspace (Nodus) for now, but tenancy stays: workspaces, brands and
-- scoped memberships carry over from beta unchanged. Stock tracking is gone.
-- New: the sheet ledger (sheet_rows, sheet_writebacks), ticket_findings as
-- the single work list across Inspect/Supply/Fix, ticket_tests by attempt,
-- ticket_photos in a private bucket, and gates enforced inside set_stage().

create extension if not exists citext;
create schema if not exists app;

-- ================================================================ enums
create type member_role as enum ('owner', 'admin', 'brand_rep', 'watchmaker');
create type stage as enum ('check_in', 'inspect', 'supply', 'fix', 'test', 'ship', 'closed');
create type component as enum ('bezel', 'crystal', 'crown', 'case', 'dial', 'hands', 'movement', 'gaskets', 'strap', 'clasp');
create type finding_condition as enum ('worn', 'scratched', 'discolored', 'cracked');
create type finding_action as enum ('fix', 'replace');
create type coverage as enum ('warranty', 'paid');
create type ticket_source as enum ('sheet', 'by_hand');
create type test_kind as enum ('time', 'water', 'looks');
create type test_result as enum ('pass', 'fail');
create type photo_kind as enum ('customer', 'bench');
create type sheet_row_status as enum ('imported', 'dismissed');
create type writeback_status as enum ('pending', 'done', 'failed');

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

-- ================================================================ catalog
create table watches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  brand_id uuid not null references brands(id),
  name text not null,
  reference text,
  warranty_months int,
  movement text,
  case_spec text,
  notes text,
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);
create trigger watches_updated_at before update on watches
  for each row execute function app.set_updated_at();

create table parts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  brand_id uuid not null references brands(id),
  component component not null,
  name text not null,
  sku text not null,
  variant text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, sku)
);
create index parts_brand_component on parts (brand_id, component);
create trigger parts_updated_at before update on parts
  for each row execute function app.set_updated_at();

create table watch_parts (
  watch_id uuid not null references watches(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  primary key (watch_id, part_id)
);

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
create table tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  workspace_id uuid not null references workspaces(id),
  brand_id uuid not null references brands(id),
  watch_id uuid not null references watches(id),
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
  customer_model_text text,
  serial text,
  issue text,
  bench_note text,

  coverage coverage,
  priority boolean not null default false,
  needs_payment boolean not null default false,
  payment_amount numeric(10,2),
  payment_received boolean not null default false,
  return_to_everett boolean not null default false,

  received_at timestamptz,
  inspect_note text,
  supply_note text,
  fix_note text,
  test_note text,
  test_attempt int not null default 1,

  search tsvector generated always as (
    to_tsvector('simple',
      coalesce(number, '') || ' ' || coalesce(customer_name, '') || ' ' ||
      coalesce(customer_email::text, '') || ' ' || coalesce(customer_model_text, '') || ' ' ||
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

-- One row per component with a problem. Inspect creates it, Supply fills the
-- part columns on Replace rows, Fix stamps done_at. Rows found later on the
-- bench carry found_at_stage = 'fix'.
create table ticket_findings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  component component not null,
  condition finding_condition,
  action finding_action not null default 'fix',
  part_id uuid references parts(id),
  found_at_stage stage not null default 'inspect',
  have_it boolean not null default false,
  requested_at timestamptz,
  arrived_at timestamptz,
  done_at timestamptz,
  done_by uuid references profiles(id),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, component)
);
create index ticket_findings_ticket on ticket_findings (ticket_id);
create trigger ticket_findings_updated_at before update on ticket_findings
  for each row execute function app.set_updated_at();

-- Time / Water / Looks per attempt. A Fail sends the ticket back to Fix and
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

create table shipments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references tickets(id) on delete cascade,
  carrier text check (carrier in ('usps', 'ups', 'fedex')),
  tracking text,
  handed_over boolean not null default false,
  email_customer boolean not null default true,
  ship_to jsonb,
  shipped_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shipments_updated_at before update on shipments
  for each row execute function app.set_updated_at();

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

-- Append-only timeline.
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

-- Stage ownership. Admins: everything. Watchmakers: every bench stage.
-- Brand reps: Check in only. Reopen (closed) is owner/admin.
create or replace function app.can_act_on(p_stage stage, p_workspace uuid, p_brand uuid) returns boolean
language sql stable as $$
  select app.is_admin_of(p_workspace)
      or (p_brand = any(app.bench_brand_ids()) and p_stage in ('check_in', 'inspect', 'supply', 'fix', 'test', 'ship'))
      or (p_brand = any(app.rep_brand_ids()) and p_stage in ('check_in'))
$$;

create or replace function app.watch_visible(p_watch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from watches w where w.id = p_watch
      and (app.is_admin_of(w.workspace_id) or w.brand_id = any(app.brand_ids()))
  )
$$;

create or replace function app.part_visible(p_part uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parts p where p.id = p_part
      and (app.is_admin_of(p.workspace_id) or p.brand_id = any(app.brand_ids()))
  )
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
create or replace function app.same_workspace_guard() returns trigger
language plpgsql as $$
declare a uuid; b uuid;
begin
  if tg_table_name = 'watch_parts' then
    select brand_id into a from watches where id = new.watch_id;
    select brand_id into b from parts where id = new.part_id;
    if a <> b then raise exception 'part and watch must belong to the same brand'; end if;
  elsif tg_table_name = 'tickets' then
    select brand_id into a from watches where id = new.watch_id;
    select workspace_id into b from brands where id = new.brand_id;
    if a <> new.brand_id then raise exception 'watch must belong to the ticket''s brand'; end if;
    if b <> new.workspace_id then raise exception 'brand must belong to the ticket''s workspace'; end if;
  elsif tg_table_name = 'ticket_findings' then
    if new.part_id is not null then
      select p.brand_id into a from parts p where p.id = new.part_id;
      select t.brand_id into b from tickets t where t.id = new.ticket_id;
      if a <> b then raise exception 'part belongs to a different brand than the ticket'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger watch_parts_same_brand before insert or update on watch_parts
  for each row execute function app.same_workspace_guard();
create trigger tickets_same_workspace before insert or update of watch_id, brand_id, workspace_id on tickets
  for each row execute function app.same_workspace_guard();
create trigger ticket_findings_same_brand before insert or update of part_id on ticket_findings
  for each row execute function app.same_workspace_guard();

-- ================================================================ write-back queue
create or replace function app.queue_writeback(p_ticket uuid, p_column text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tickets t where t.id = p_ticket and t.sheet_row_id is not null) then
    return;  -- by-hand tickets have no sheet row
  end if;
  insert into sheet_writebacks (ticket_id, column_name, value) values (p_ticket, p_column, p_value);
end $$;

-- Payment Received? follows the ticket flag.
create or replace function app.tickets_payment_writeback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_received is distinct from old.payment_received then
    perform app.queue_writeback(new.id, 'Payment Received?', case when new.payment_received then 'TRUE' else 'FALSE' end);
  end if;
  return new;
end $$;
create trigger tickets_payment_writeback after update of payment_received on tickets
  for each row execute function app.tickets_payment_writeback();

-- ================================================================ stage machine
-- The only door to tickets.stage. Scope, ownership and every gate live here.
create or replace function set_stage(p_ticket uuid, p_to stage, p_kind text default 'stage_changed', p_override boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  v_order stage[] := '{check_in,inspect,supply,fix,test,ship,closed}';
  v_from_ix int;
  v_to_ix int;
  v_missing text;
  v_solution text;
begin
  select * into t from tickets where id = p_ticket for update;
  if t.id is null then raise exception 'ticket not found'; end if;
  if not app.in_scope(t.workspace_id, t.brand_id) then raise exception 'ticket not in your scope'; end if;
  if p_kind not in ('stage_changed', 'sent_back', 'reopened') then raise exception 'unknown event kind %', p_kind; end if;

  v_from_ix := array_position(v_order, t.stage);
  v_to_ix := array_position(v_order, p_to);

  if p_kind = 'reopened' then
    if t.stage <> 'closed' then raise exception 'only a closed ticket can be reopened'; end if;
    if not app.is_admin_of(t.workspace_id) then raise exception 'reopen is for owners and admins'; end if;
    if p_to <> 'ship' then raise exception 'a reopened ticket returns to Ship'; end if;
  elsif p_kind = 'sent_back' then
    if not app.can_act_on(t.stage, t.workspace_id, t.brand_id) then raise exception 'your role does not own the % stage', t.stage; end if;
    if v_to_ix >= v_from_ix or t.stage = 'closed' then raise exception 'send back must move to an earlier open stage'; end if;
    if t.stage = 'test' and p_to = 'fix' then
      update tickets set test_attempt = test_attempt + 1 where id = p_ticket;
    end if;
  else
    if not app.can_act_on(t.stage, t.workspace_id, t.brand_id) then raise exception 'your role does not own the % stage', t.stage; end if;
    if v_to_ix <> v_from_ix + 1 then raise exception 'stages advance one at a time'; end if;

    -- gates
    if t.stage = 'inspect' then
      select string_agg(f.component::text, ', ') into v_missing
        from ticket_findings f where f.ticket_id = p_ticket and f.action = 'replace' and f.part_id is null;
      if v_missing is not null then raise exception 'pick a catalog part for: %', v_missing; end if;
    elsif t.stage = 'supply' then
      select string_agg(coalesce(p.name, f.component::text), ', ') into v_missing
        from ticket_findings f left join parts p on p.id = f.part_id
       where f.ticket_id = p_ticket and f.action = 'replace' and not f.have_it and f.arrived_at is null;
      if v_missing is not null then raise exception 'still waiting on: %', v_missing; end if;
    elsif t.stage = 'fix' then
      select string_agg(f.component::text, ', ') into v_missing
        from ticket_findings f where f.ticket_id = p_ticket and f.done_at is null;
      if v_missing is not null then raise exception 'not marked done: %', v_missing; end if;
    elsif t.stage = 'test' then
      if (select count(*) from ticket_tests x where x.ticket_id = p_ticket and x.attempt = t.test_attempt and x.result = 'pass') < 3 then
        raise exception 'all three tests must pass';
      end if;
    elsif t.stage = 'ship' then
      if not exists (select 1 from shipments s where s.ticket_id = p_ticket and (s.handed_over or nullif(trim(s.tracking), '') is not null)) then
        raise exception 'add tracking or mark the watch handed over';
      end if;
      if t.needs_payment and not t.payment_received then
        if not (p_override and app.is_admin_of(t.workspace_id)) then
          raise exception 'payment has not been received';
        end if;
      end if;
    end if;
  end if;

  update tickets
     set stage = p_to,
         closed_at = case when p_to = 'closed' then now() else null end
   where id = p_ticket;

  insert into ticket_events (ticket_id, type, actor_id, from_stage, to_stage, payload)
  values (p_ticket, p_kind, auth.uid(), t.stage, p_to,
          case when p_override and t.stage = 'ship' and t.needs_payment and not t.payment_received
               then '{"payment_override": true}'::jsonb end);

  -- side effects of a forward move
  if p_kind = 'stage_changed' then
    if t.stage = 'inspect' then
      select string_agg(f.action::text || ' ' || f.component::text, ', ' order by f.component) into v_solution
        from ticket_findings f where f.ticket_id = p_ticket;
      perform app.queue_writeback(p_ticket, 'Solution', coalesce(v_solution, 'no work needed'));
    elsif t.stage = 'fix' then
      perform app.queue_writeback(p_ticket, 'Repair Completed?', 'TRUE');
    elsif t.stage = 'ship' then
      update shipments set shipped_at = coalesce(shipped_at, now()) where ticket_id = p_ticket;
      perform app.queue_writeback(p_ticket, 'Shipped Back?', 'TRUE');
    end if;
  end if;
end $$;

-- ================================================================ board view
-- What the bench and dashboard list: one row per ticket with the derived
-- state the cards show. security_invoker so ticket RLS applies.
create view ticket_board with (security_invoker = true) as
select
  t.id, t.number, t.workspace_id, t.brand_id, t.stage, t.source,
  t.customer_name, w.name as watch_name, t.watch_id,
  t.priority, t.needs_payment, t.payment_received, t.return_to_everett, t.coverage,
  t.received_at, t.created_at, t.closed_at,
  coalesce(e.entered_at, t.created_at) as stage_entered_at,
  (t.stage = 'supply' and exists (
     select 1 from ticket_findings f where f.ticket_id = t.id and f.action = 'replace'
       and f.requested_at is not null and not f.have_it and f.arrived_at is null)) as parked,
  (select coalesce(p.name, f.component::text) from ticket_findings f left join parts p on p.id = f.part_id
     where f.ticket_id = t.id and f.action = 'replace' and not f.have_it and f.arrived_at is null
     order by f.requested_at nulls last, f.created_at limit 1) as waiting_on,
  (select max(f.requested_at) from ticket_findings f where f.ticket_id = t.id) as parts_requested_at,
  (select count(*) from ticket_findings f where f.ticket_id = t.id)::int as findings_total,
  (select count(*) from ticket_findings f where f.ticket_id = t.id and f.done_at is not null)::int as findings_done,
  (select count(*) from ticket_findings f where f.ticket_id = t.id and f.action = 'replace')::int as replace_total,
  (select count(*) from ticket_findings f where f.ticket_id = t.id and f.action = 'replace' and (f.have_it or f.arrived_at is not null))::int as replace_in_hand,
  (select count(*) from ticket_tests x where x.ticket_id = t.id and x.attempt = t.test_attempt and x.result = 'pass')::int as tests_passed,
  exists (select 1 from shipments s where s.ticket_id = t.id and (s.handed_over or nullif(trim(s.tracking), '') is not null)) as ship_ready,
  (select ph.storage_path from ticket_photos ph where ph.ticket_id = t.id and ph.kind = 'bench' order by ph.sort limit 1) as bench_photo_path
from tickets t
join watches w on w.id = t.watch_id
left join lateral (
  select ev.created_at as entered_at from ticket_events ev
   where ev.ticket_id = t.id and ev.to_stage = t.stage and ev.type in ('stage_changed', 'sent_back', 'reopened', 'created')
   order by ev.created_at desc limit 1
) e on true;

-- ================================================================ row-level security
alter table workspaces enable row level security;
alter table brands enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table watches enable row level security;
alter table parts enable row level security;
alter table watch_parts enable row level security;
alter table sheet_rows enable row level security;
alter table tickets enable row level security;
alter table ticket_findings enable row level security;
alter table ticket_tests enable row level security;
alter table shipments enable row level security;
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

create policy watches_read on watches for select to authenticated
  using (app.watch_visible(id));
create policy watches_write on watches for all to authenticated
  using (app.is_admin_of(workspace_id)) with check (app.is_admin_of(workspace_id));

create policy parts_read on parts for select to authenticated
  using (app.part_visible(id));
create policy parts_write on parts for all to authenticated
  using (app.is_admin_of(workspace_id)) with check (app.is_admin_of(workspace_id));

create policy watch_parts_read on watch_parts for select to authenticated
  using (app.watch_visible(watch_id));
create policy watch_parts_write on watch_parts for all to authenticated
  using (exists (select 1 from watches w where w.id = watch_id and app.is_admin_of(w.workspace_id)))
  with check (exists (select 1 from watches w where w.id = watch_id and app.is_admin_of(w.workspace_id)));

create policy sheet_rows_read on sheet_rows for select to authenticated
  using (app.can_intake(workspace_id));
create policy sheet_rows_insert on sheet_rows for insert to authenticated
  with check (app.can_intake(workspace_id) and acted_by = auth.uid());
create policy sheet_rows_update on sheet_rows for update to authenticated
  using (app.can_intake(workspace_id)) with check (app.can_intake(workspace_id));

create policy tickets_read on tickets for select to authenticated
  using (app.in_scope(workspace_id, brand_id));
create policy tickets_insert on tickets for insert to authenticated
  with check (app.can_intake(workspace_id) and brand_id = any(app.brand_ids()) or app.is_admin_of(workspace_id));
create policy tickets_update on tickets for update to authenticated
  using (app.in_scope(workspace_id, brand_id)) with check (app.in_scope(workspace_id, brand_id));
create policy tickets_delete on tickets for delete to authenticated
  using (app.is_admin_of(workspace_id));

create policy ticket_findings_all on ticket_findings for all to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));
create policy ticket_tests_all on ticket_tests for all to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));
create policy shipments_all on shipments for all to authenticated
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
select app.grant_columns_except('profiles', 'update', array['id', 'email', 'is_active', 'created_at', 'updated_at']);
select app.grant_columns_except('ticket_findings', 'update', array['id', 'ticket_id', 'created_by', 'created_at', 'updated_at']);
select app.grant_columns_except('sheet_rows', 'update', array['id', 'workspace_id', 'fingerprint', 'raw', 'acted_by', 'created_at']);

-- ================================================================ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- tickets/<ticket_id>/... follows the ticket; watches/<watch_id>/... follows the watch.
create or replace function app.photo_path_allowed(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_id uuid;
begin
  parts := storage.foldername(p_name);
  if array_length(parts, 1) < 2 then return false; end if;
  begin v_id := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'tickets' then
    return app.ticket_in_scope(v_id);
  elsif parts[1] = 'watches' then
    if p_write then
      return exists (select 1 from watches w where w.id = v_id and app.is_admin_of(w.workspace_id));
    end if;
    return app.watch_visible(v_id);
  end if;
  return false;
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
grant execute on function set_stage(uuid, stage, text, boolean) to authenticated;
grant execute on function my_real_grants() to authenticated;
grant execute on function admin_update_profile(uuid, text, boolean) to authenticated;
grant select on ticket_board to authenticated;
