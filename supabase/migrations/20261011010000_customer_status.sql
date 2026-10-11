-- Check a repair (P2): two definer functions open to anonymous callers.
-- Both need the ticket number AND the customer's email; the response is a
-- customer-safe view of the ticket with public stage names. Nothing else
-- about the ticket leaves the database.

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
    'ship_to', t.ship_to,
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

revoke all on function customer_ticket_status(text, text) from public;
revoke all on function customer_request_address_update(text, text, jsonb) from public;
grant execute on function customer_ticket_status(text, text) to anon, authenticated;
grant execute on function customer_request_address_update(text, text, jsonb) to anon, authenticated;
