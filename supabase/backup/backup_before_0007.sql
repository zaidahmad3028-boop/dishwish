-- Snapshot every public table into a separate schema before running 0007-0010 and the new recipe seed.
-- Run in SQL Editor as postgres. Safe: it only creates copies, it changes nothing in public.
-- Restore a table if ever needed: insert into public.<t> select * from backup_pre_0007.<t> on conflict do nothing;
-- Remove the snapshot later with: drop schema backup_pre_0007 cascade;
begin;
create schema if not exists backup_pre_0007;
revoke all on schema backup_pre_0007 from public, anon, authenticated;
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('drop table if exists backup_pre_0007.%I', t);
    execute format('create table backup_pre_0007.%I as select * from public.%I', t, t);
  end loop;
end $$;
commit;
select table_name as table_copied,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from backup_pre_0007.%I', table_name), false, true, '')))[1]::text::int as rows_copied
from information_schema.tables where table_schema = 'backup_pre_0007' order by 1;
