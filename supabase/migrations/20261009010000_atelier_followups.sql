-- Follow-ups from the Atelier handoff (Oct 9, 2026).
--
--   * Inspect shows twelve components: Caseback and Lume join the enum.
--   * Supply rows are parts, not findings: the mock lists a "spare bezel
--     insert" next to the planned one. ticket_parts holds one row per part
--     the repair needs; a trigger keeps a row per Replace finding, and the
--     watchmaker can add extras by hand. have_it / requested_at / arrived_at
--     move here from ticket_findings.
--   * Check in needs "watch is on the bench" ticked before Inspect.
--   * Shipments gain signature_required; tickets gain bench_minutes.

alter type component add value if not exists 'caseback';
alter type component add value if not exists 'lume';

-- ================================================================ ticket_parts
create table ticket_parts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  finding_id uuid references ticket_findings(id) on delete cascade,
  part_id uuid not null references parts(id),
  qty int not null default 1 check (qty > 0),
  label text,
  have_it boolean not null default false,
  requested_at timestamptz,
  arrived_at timestamptz,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ticket_parts_one_per_finding on ticket_parts (finding_id) where finding_id is not null;
create index ticket_parts_ticket on ticket_parts (ticket_id);
create trigger ticket_parts_updated_at before update on ticket_parts
  for each row execute function app.set_updated_at();

-- Carry over what the first migration stored on findings.
insert into ticket_parts (ticket_id, finding_id, part_id, have_it, requested_at, arrived_at, created_by, created_at)
select f.ticket_id, f.id, f.part_id, f.have_it, f.requested_at, f.arrived_at, f.created_by, f.created_at
  from ticket_findings f
 where f.action = 'replace' and f.part_id is not null;

drop view ticket_board;  -- rebuilt below
alter table ticket_findings drop column have_it, drop column requested_at, drop column arrived_at;

-- A Replace finding with a part always has exactly one ticket_parts row;
-- anything else has none. Supply state on an existing row survives a part swap.
create or replace function app.sync_finding_part() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    return old;  -- cascade removes the row
  end if;
  if new.action = 'replace' and new.part_id is not null then
    insert into ticket_parts (ticket_id, finding_id, part_id, created_by)
    values (new.ticket_id, new.id, new.part_id, coalesce(new.created_by, auth.uid()))
    on conflict (finding_id) where finding_id is not null
    do update set part_id = excluded.part_id;
  else
    delete from ticket_parts where finding_id = new.id;
  end if;
  return new;
end $$;
create trigger ticket_findings_sync_part after insert or update of action, part_id on ticket_findings
  for each row execute function app.sync_finding_part();

-- Brand integrity for the new table.
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
  elsif tg_table_name in ('ticket_findings', 'ticket_parts') then
    if new.part_id is not null then
      select p.brand_id into a from parts p where p.id = new.part_id;
      select t.brand_id into b from tickets t where t.id = new.ticket_id;
      if a <> b then raise exception 'part belongs to a different brand than the ticket'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger ticket_parts_same_brand before insert or update of part_id on ticket_parts
  for each row execute function app.same_workspace_guard();

alter table ticket_parts enable row level security;
create policy ticket_parts_all on ticket_parts for all to authenticated
  using (app.ticket_in_scope(ticket_id)) with check (app.ticket_in_scope(ticket_id));
select app.grant_columns_except('ticket_parts', 'update', array['id', 'ticket_id', 'finding_id', 'created_by', 'created_at', 'updated_at']);

-- ================================================================ small columns
alter table shipments add column signature_required boolean not null default false;
alter table tickets add column bench_minutes int;

-- ================================================================ stage machine
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

    if t.stage = 'check_in' then
      if t.received_at is null then raise exception 'tick "watch is on the bench" first'; end if;
    elsif t.stage = 'inspect' then
      select string_agg(f.component::text, ', ') into v_missing
        from ticket_findings f where f.ticket_id = p_ticket and f.action = 'replace' and f.part_id is null;
      if v_missing is not null then raise exception 'pick a catalog part for: %', v_missing; end if;
    elsif t.stage = 'supply' then
      select string_agg(coalesce(tp.label, p.name), ', ') into v_missing
        from ticket_parts tp join parts p on p.id = tp.part_id
       where tp.ticket_id = p_ticket and not tp.have_it and tp.arrived_at is null;
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
create view ticket_board with (security_invoker = true) as
select
  t.id, t.number, t.workspace_id, t.brand_id, t.stage, t.source,
  t.customer_name, w.name as watch_name, t.watch_id,
  t.priority, t.needs_payment, t.payment_received, t.return_to_everett, t.coverage,
  t.received_at, t.created_at, t.closed_at,
  coalesce(e.entered_at, t.created_at) as stage_entered_at,
  (t.stage = 'supply' and exists (
     select 1 from ticket_parts tp where tp.ticket_id = t.id
       and tp.requested_at is not null and not tp.have_it and tp.arrived_at is null)) as parked,
  (select coalesce(tp.label, p.name) from ticket_parts tp join parts p on p.id = tp.part_id
     where tp.ticket_id = t.id and not tp.have_it and tp.arrived_at is null
     order by tp.requested_at nulls last, tp.created_at limit 1) as waiting_on,
  (select max(tp.requested_at) from ticket_parts tp where tp.ticket_id = t.id) as parts_requested_at,
  (select count(*) from ticket_findings f where f.ticket_id = t.id)::int as findings_total,
  (select count(*) from ticket_findings f where f.ticket_id = t.id and f.done_at is not null)::int as findings_done,
  (select count(*) from ticket_parts tp where tp.ticket_id = t.id)::int as parts_total,
  (select count(*) from ticket_parts tp where tp.ticket_id = t.id and (tp.have_it or tp.arrived_at is not null))::int as parts_in_hand,
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
grant select on ticket_board to authenticated;

grant execute on all functions in schema app to authenticated;
revoke execute on function app.queue_writeback(uuid, text, text) from authenticated;
revoke execute on function app.sync_finding_part() from authenticated;
