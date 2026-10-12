-- Photos: parts get a photo like watches; storage paths for parts; the
-- board's thumbnail falls back to the first customer photo when nobody has
-- taken a bench photo yet.

alter table parts add column if not exists photo_path text;

-- tickets/<ticket_id>/... follows the ticket; watches/<id>/... and parts/<id>/...
-- are readable by anyone who can see the catalog row and writable by admins.
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
  elsif parts[1] = 'parts' then
    if p_write then
      return exists (select 1 from public.parts p where p.id = v_id and app.is_admin_of(p.workspace_id));
    end if;
    return app.part_visible(v_id);
  end if;
  return false;
end $$;

-- Board thumbnail: the first bench photo, else the first customer photo.
create or replace view ticket_board with (security_invoker = true) as
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
  (select ph.storage_path from ticket_photos ph where ph.ticket_id = t.id order by (ph.kind = 'bench') desc, ph.sort, ph.created_at limit 1) as bench_photo_path
from tickets t
join watches w on w.id = t.watch_id
left join lateral (
  select ev.created_at as entered_at from ticket_events ev
   where ev.ticket_id = t.id and ev.to_stage = t.stage and ev.type in ('stage_changed', 'sent_back', 'reopened', 'created')
   order by ev.created_at desc limit 1
) e on true;
grant select on ticket_board to authenticated;
