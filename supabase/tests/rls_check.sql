-- Run AFTER both migrations and seed, as postgres in Supabase SQL Editor.
-- Uses disposable users, switches to real API roles, and rolls everything back.
-- Any failed assertion aborts. Success returns a PASS row, followed by ROLLBACK.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end $$;
select pg_temp.assert_true((select count(*) = 7 and bool_and(c.relrowsecurity)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
  ('categories','ingredients','profiles','preferences','pantry_items','saved_recipes','shared_recipes')),
  'all seven tables exist with RLS enabled');
select pg_temp.assert_true((select count(*) = 260 from public.ingredients), '260 seeded ingredients');
select pg_temp.assert_true((select count(*) = 8 from public.categories), 'eight seeded categories');
insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'rls-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'rls-b@example.invalid');
select pg_temp.assert_true((select count(*) = 2 from public.profiles where user_id in
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 'signup profiles');
select pg_temp.assert_true((select count(*) = 2 from public.preferences where user_id in
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 'signup preferences');

set local role anon;
select pg_temp.assert_true((select count(*) = 260 from public.ingredients), 'anonymous ingredient read');
select pg_temp.assert_true((select count(*) = 8 from public.categories), 'anonymous category read');
do $$ begin
  begin
    perform * from public.profiles;
    raise exception 'FAIL: anonymous private read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.categories(name) values ('Forbidden');
    raise exception 'FAIL: anonymous catalog write allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shared_recipes(data, created_by) values ('{}', '10000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: anonymous share insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'only own profile visible');
select pg_temp.assert_true((select count(*) = 1 from public.preferences), 'only own preferences visible');
update public.profiles set display_name = 'RLS test' where user_id = auth.uid();
update public.preferences set sweet = 'low' where user_id = auth.uid();
insert into public.pantry_items(user_id, ingredient_id, quantity_g)
  select auth.uid(), id, 100 from public.ingredients order by id limit 1;
insert into public.saved_recipes(user_id, title, fingerprint, data)
  values (auth.uid(), 'RLS test', 'rls-test', '{}');
insert into public.shared_recipes(token, created_by, data)
  values ('20000000-0000-4000-8000-000000000001', auth.uid(), '{"title":"Public test"}');
select pg_temp.assert_true((select count(*) = 1 from public.pantry_items), 'own pantry insert/read');
select pg_temp.assert_true((select count(*) = 1 from public.saved_recipes), 'own recipe insert/read');
do $$ begin
  begin
    insert into public.categories(name) values ('Forbidden');
    raise exception 'FAIL: authenticated catalog write allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set user_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: ownership transfer allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_recipes(user_id,title,fingerprint,data) values (auth.uid(),'Duplicate','rls-test','{}');
    raise exception 'FAIL: duplicate fingerprint allowed';
  exception when unique_violation then null; end;
  begin
    update public.preferences set allergens = array['invented'];
    raise exception 'FAIL: unknown allergen allowed';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.pantry_items), 'cross-user pantry hidden');
select pg_temp.assert_true((select count(*) = 0 from public.saved_recipes), 'cross-user recipes hidden');
do $$ declare affected integer; begin
  update public.profiles set display_name = 'Intruder' where user_id = '10000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-user profile update blocked');
  update public.preferences set sweet = 'high' where user_id = '10000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-user preferences update blocked');
  update public.pantry_items set quantity_g = 0;
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-user pantry update blocked');
  delete from public.saved_recipes;
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-user recipe delete blocked');
  delete from public.shared_recipes where token = '20000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'cross-user share delete blocked');
  begin
    insert into public.pantry_items(user_id, ingredient_id) select '10000000-0000-4000-8000-000000000001', id from public.ingredients limit 1;
    raise exception 'FAIL: cross-user pantry insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_recipes(user_id,title,fingerprint,data) values ('10000000-0000-4000-8000-000000000001','Intruder','intruder','{}');
    raise exception 'FAIL: cross-user recipe insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shared_recipes(created_by,data) values ('10000000-0000-4000-8000-000000000001','{}');
    raise exception 'FAIL: spoofed share owner allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
select pg_temp.assert_true((select count(*) = 1 from public.shared_recipes where token = '20000000-0000-4000-8000-000000000001'), 'anonymous public share read');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
delete from public.pantry_items;
delete from public.saved_recipes;
delete from public.shared_recipes where token = '20000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.pantry_items), 'owner pantry delete');
select pg_temp.assert_true((select count(*) = 0 from public.saved_recipes), 'owner recipe delete');
select pg_temp.assert_true((select count(*) = 0 from public.shared_recipes where token = '20000000-0000-4000-8000-000000000001'), 'owner share delete');
reset role;
select 'PASS: counts, signup triggers, catalog access, owner isolation, public shares, and constraints' as result;
rollback;
