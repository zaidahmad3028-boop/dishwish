-- Run AFTER 0005_admin_recipes.sql and seed/recipes.sql, as postgres in Supabase SQL Editor.
-- Disposable users, real API roles, everything rolled back. Success returns a PASS row.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end $$;
select pg_temp.assert_true((select count(*) >= 30 from public.curated_recipes where status = 'published'), 'curated recipes seeded');
select pg_temp.assert_true((select bool_and(n >= 3) from (select count(*) n from public.recipe_steps group by recipe_id) s), 'every recipe has steps');
select pg_temp.assert_true((select count(*) > 100 from public.ingredient_compatibility), 'compatibility edges seeded');
select pg_temp.assert_true((select public.valid_recommendation_settings(value) from public.app_settings where key = 'recommendation'), 'default weights valid');

insert into auth.users(id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin-check-user@example.invalid'),
  ('30000000-0000-4000-8000-000000000002', 'admin-check-other@example.invalid'),
  ('30000000-0000-4000-8000-000000000003', 'admin-check-admin@example.invalid');
select public.grant_super_admin('admin-check-admin@example.invalid');

-- Anonymous: published recipes and public settings only; no admin RPCs.
set local role anon;
select pg_temp.assert_true((select count(*) >= 30 from public.curated_recipes), 'anon reads published recipes');
select pg_temp.assert_true((select count(*) = 2 from public.app_settings), 'anon reads public settings');
do $$ begin
  begin perform public.admin_overview(30); raise exception 'FAIL: anon ran admin_overview';
  exception when insufficient_privilege then null; end;
  begin perform * from public.feedback; raise exception 'FAIL: anon read feedback';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Normal user: can write own feedback/events, cannot see others', cannot use admin powers.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select public.my_account() ->> 'role') = 'user', 'user role reported');
insert into public.feedback(kind, rating, message) values ('rating', 5, 'Great');
insert into public.recipe_events(kind, recipe_slug, recipe_name, match_percent, ingredients)
  values ('generated', 'chicken-karahi', 'Chicken Karahi', 62, array['Chicken Breast', 'Tomato']);
do $$ begin
  begin perform public.admin_overview(30); raise exception 'FAIL: user ran admin_overview';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list_users('', '', 1, 10); raise exception 'FAIL: user listed users';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_user_status('30000000-0000-4000-8000-000000000002', 'deactivated'); raise exception 'FAIL: user deactivated someone';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set status = 'deactivated' where user_id = auth.uid(); raise exception 'FAIL: user changed own status';
  exception when insufficient_privilege then null; end;
  begin insert into public.feedback(kind, message, status) values ('bug', 'x', 'resolved'); raise exception 'FAIL: user set feedback status';
  exception when insufficient_privilege then null; end;
  begin insert into public.feedback(user_id, kind, message) values ('30000000-0000-4000-8000-000000000002', 'bug', 'x'); raise exception 'FAIL: user forged feedback owner';
  exception when insufficient_privilege then null; end;
  begin insert into public.user_roles(user_id, role) values (auth.uid(), 'super_admin'); raise exception 'FAIL: user self-promoted';
  exception when insufficient_privilege then null; end;
end $$;
update public.ingredients set kcal = 1 where name = 'Tomato';
select pg_temp.assert_true((select kcal <> 1 from public.ingredients where name = 'Tomato'), 'user cannot edit ingredients (RLS hides the row from update)');
update public.app_settings set value = '{}'::jsonb where key = 'recommendation';
select pg_temp.assert_true((select value <> '{}'::jsonb from public.app_settings where key = 'recommendation'), 'user cannot edit settings');
select pg_temp.assert_true((select count(*) = 0 from public.admin_audit_log), 'user cannot read audit log');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.feedback), 'other user cannot read feedback');
select pg_temp.assert_true((select count(*) = 0 from public.recipe_events), 'other user cannot read events');
reset role;

-- Super Admin: analytics, management and audit.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true((select public.my_account() ->> 'role') = 'super_admin', 'admin role reported');
select pg_temp.assert_true((select (public.admin_overview(30) ->> 'generations')::int >= 1), 'overview counts generations');
select pg_temp.assert_true((select count(*) = 30 from public.admin_timeseries(30)), '30-day series');
select pg_temp.assert_true((select uses >= 1 from public.admin_top_ingredients(30, 8) where name = 'Tomato'), 'top ingredients aggregate');
select pg_temp.assert_true((select (public.admin_list_users('admin-check', '', 1, 10) ->> 'total')::int = 3), 'user search');
select public.admin_set_user_status('30000000-0000-4000-8000-000000000002', 'deactivated');
select pg_temp.assert_true((public.admin_list_users('admin-check-other', '', 1, 10) -> 'rows' -> 0 ->> 'status') = 'deactivated', 'admin deactivates user');
do $$ begin
  begin perform public.admin_set_user_status('30000000-0000-4000-8000-000000000003', 'deactivated'); raise exception 'FAIL: admin deactivated self';
  exception when insufficient_privilege then null; end;
end $$;
update public.feedback set status = 'resolved', admin_note = 'Thanks' where message = 'Great';
select pg_temp.assert_true((select resolved_at is not null from public.feedback where message = 'Great'), 'feedback resolved with timestamp');
update public.app_settings set value = jsonb_set(value, '{min_score}', '0.3') where key = 'recommendation';
do $$ begin
  begin
    update public.app_settings set value = jsonb_set(value, '{missing_penalty}', '5') where key = 'recommendation';
    raise exception 'FAIL: invalid weights accepted';
  exception when check_violation then null; end;
end $$;
insert into public.ingredient_compatibility(ingredient_a, ingredient_b, weight, relation_type, evidence)
  select least(a.id, b.id), greatest(a.id, b.id), 0.9, 'complementary', 'admin check'
  from public.ingredients a, public.ingredients b where a.name = 'Mango' and b.name = 'Yogurt (Dahi)'
  on conflict (ingredient_a, ingredient_b) do update set weight = 0.9;
select public.admin_save_recipe(jsonb_build_object('slug', 'admin-check-dish', 'name', 'Admin Check Dish', 'category', 'Snacks',
  'minutes', 10, 'servings', 2, 'taste', '{"sweet":1,"salty":5,"sour":2,"spicy":3}'::jsonb, 'status', 'draft',
  'ingredients', jsonb_build_array(jsonb_build_object('ingredient_id', (select id from public.ingredients where name = 'Potato'), 'grams', 200, 'display', '2')),
  'steps', jsonb_build_array('Boil.', 'Serve.')));
select pg_temp.assert_true((select count(*) = 2 from public.recipe_steps s join public.curated_recipes r on r.id = s.recipe_id where r.slug = 'admin-check-dish'), 'admin saves recipe with steps');
do $$ begin
  begin perform public.admin_save_recipe('{"slug":"bad-dish","name":"Bad","category":"Snacks","minutes":5,"servings":1,"taste":{},"ingredients":[],"steps":["x"]}'::jsonb);
    raise exception 'FAIL: recipe without ingredients accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
select pg_temp.assert_true((select count(*) >= 4 from public.admin_audit_log), 'admin actions audited');
select pg_temp.assert_true((select count(*) = 1 from public.admin_audit_log where action = 'set_status'), 'status change audited');
reset role;

-- Deactivated user loses private data access.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.preferences), 'deactivated user blocked from preferences');
select pg_temp.assert_true((select public.my_account() ->> 'status') = 'deactivated', 'deactivated status reported');
reset role;
select 'PASS: roles, admin RPC guards, feedback, events, settings validation, audit and deactivation' as result;
rollback;
