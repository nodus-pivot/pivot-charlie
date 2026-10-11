-- Check a repair shows city, state and ZIP only; the street stays private.

create or replace function customer_ticket_status(p_number text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  v_watch text;
  v_shipment shipments%rowtype;
  v_entered jsonb;
begin
  if p_number is null or p_email is null then return null; end if;
  select * into t from tickets
   where upper(trim(number)) = upper(trim(p_number)) and customer_email = lower(trim(p_email))::citext;
  if t.id is null then return null; end if;

  select name into v_watch from watches where id = t.watch_id;
  select * into v_shipment from shipments where ticket_id = t.id;

  -- First time each stage was entered, from the timeline.
  select jsonb_object_agg(stage, at) into v_entered from (
    select to_stage::text as stage, min(created_at) as at
      from ticket_events
     where ticket_id = t.id and to_stage is not null and type in ('created', 'stage_changed', 'sent_back', 'reopened')
     group by to_stage
  ) s;

  return jsonb_build_object(
    'number', t.number,
    'watch', v_watch,
    'first_name', split_part(trim(t.customer_name), ' ', 1),
    'submitted_at', t.created_at,
    'stage', t.stage,
    'entered', coalesce(v_entered, '{}'::jsonb),
    'received_at', t.received_at,
    'shipped_at', v_shipment.shipped_at,
    'closed_at', t.closed_at,
    'carrier', v_shipment.carrier,
    'tracking', case when t.stage = 'closed' then v_shipment.tracking end,
    'handed_over', coalesce(v_shipment.handed_over, false),
    'return_to_everett', t.return_to_everett,
    -- Only the part of the address a customer needs to recognise it. The street never leaves the database.
    'ship_to', case when t.ship_to is not null then jsonb_build_object('city', t.ship_to ->> 'city', 'state', t.ship_to ->> 'state', 'postal_code', t.ship_to ->> 'postal_code') end,
    'address_change_pending', exists (
      select 1 from ticket_events e where e.ticket_id = t.id and e.type = 'address_update_requested'
         and not exists (select 1 from ticket_events r where r.ticket_id = t.id and r.type in ('address_update_accepted', 'address_update_declined') and r.created_at > e.created_at)
    )
  );
end $$;

