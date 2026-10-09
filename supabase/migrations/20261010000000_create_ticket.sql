-- create_ticket(): the one way a ticket comes into being. Assigns the number
-- (prefix + YY + 4 digits, per workspace and year), writes the optional sheet
-- ledger row, the ticket and its 'created' event in one transaction. Used by
-- Incoming (p_sheet_row set) and New ticket by hand (p_sheet_row null).

create or replace function create_ticket(p jsonb)
returns table (id uuid, number text)
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := (p ->> 'workspace_id')::uuid;
  v_brand uuid := (p ->> 'brand_id')::uuid;
  v_watch uuid := (p ->> 'watch_id')::uuid;
  v_prefix text;
  v_yy text := to_char(now() at time zone 'America/Los_Angeles', 'YY');
  v_seq int;
  v_number text;
  v_sheet_row uuid;
  v_id uuid;
  v_received timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not app.can_intake(v_ws) then raise exception 'not allowed to create tickets here'; end if;
  if not (app.is_admin_of(v_ws) or v_brand = any(app.brand_ids())) then raise exception 'not allowed for this brand'; end if;
  if not exists (select 1 from brands b where b.id = v_brand and b.workspace_id = v_ws) then raise exception 'brand is not in this workspace'; end if;
  if not exists (select 1 from watches w where w.id = v_watch and w.brand_id = v_brand and w.is_active) then raise exception 'pick a catalog model'; end if;
  if coalesce(trim(p ->> 'customer_name'), '') = '' then raise exception 'customer name is required'; end if;

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

  v_received := case when coalesce((p ->> 'on_bench')::boolean, false) then now() else null end;

  insert into tickets (
    number, workspace_id, brand_id, watch_id, source, sheet_row_id, claim_ref, created_by,
    customer_name, customer_email, customer_phone, ship_to, customer_model_text, serial, issue, bench_note,
    coverage, priority, needs_payment, payment_amount, return_to_everett, received_at
  ) values (
    v_number, v_ws, v_brand, v_watch,
    coalesce((p ->> 'source')::ticket_source, case when v_sheet_row is null then 'by_hand' else 'sheet' end),
    v_sheet_row, nullif(trim(p ->> 'claim_ref'), ''), auth.uid(),
    trim(p ->> 'customer_name'), nullif(lower(trim(p ->> 'customer_email')), '')::citext, nullif(trim(p ->> 'customer_phone'), ''),
    case when p ? 'ship_to' and jsonb_typeof(p -> 'ship_to') = 'object' then p -> 'ship_to' end,
    nullif(trim(p ->> 'customer_model_text'), ''), nullif(trim(p ->> 'serial'), ''), nullif(trim(p ->> 'issue'), ''), nullif(trim(p ->> 'bench_note'), ''),
    nullif(p ->> 'coverage', '')::coverage,
    coalesce((p ->> 'priority')::boolean, false),
    coalesce((p ->> 'needs_payment')::boolean, false),
    nullif(p ->> 'payment_amount', '')::numeric,
    coalesce((p ->> 'return_to_everett')::boolean, false),
    v_received
  ) returning tickets.id into v_id;

  insert into ticket_events (ticket_id, type, actor_id, to_stage, payload)
  values (v_id, 'created', auth.uid(), 'check_in', jsonb_build_object('source', case when v_sheet_row is null then 'by_hand' else 'sheet' end));

  return query select v_id, v_number;
end $$;

grant execute on function create_ticket(jsonb) to authenticated;
