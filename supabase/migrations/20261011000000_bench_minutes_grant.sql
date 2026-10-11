-- tickets.bench_minutes was added after the column-level UPDATE grants were
-- laid down, so authenticated users could not write it. Grant it now.
grant update (bench_minutes) on tickets to authenticated;
