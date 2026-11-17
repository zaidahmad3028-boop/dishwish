-- Settings offers Vegan, Low Carb and Keto; the check from 0005 only allows four diets.
-- Widens what may be saved. No row is changed or deleted, and it is safe to run twice.
begin;

-- 0005 left the check unnamed, so find it by what it checks: a wrong guessed name would be
-- skipped silently and the old rule would keep rejecting these diets.
do $$
declare
  old_check text;
begin
  for old_check in
    select conname from pg_constraint
    where conrelid = 'public.preferences'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%diets%'
  loop
    execute format('alter table public.preferences drop constraint %I', old_check);
  end loop;
end $$;

alter table public.preferences add constraint preferences_diets_check
  check (diets <@ array['vegetarian','vegan','gluten_free','low_calorie','high_protein','low_carb','keto']::text[]);

commit;
