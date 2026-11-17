-- Lets the app update the moment its data changes, instead of at the next 30-second refresh.
-- Changes no rows and no access rules: Realtime only sends a row to someone whose select policy already allows it.
-- Safe to run twice.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['feedback', 'curated_recipes', 'ingredients', 'ingredient_compatibility', 'pantry_items', 'saved_recipes', 'preferences', 'recipe_events', 'app_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
