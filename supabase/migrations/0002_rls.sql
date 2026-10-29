begin;
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.ingredients to anon, authenticated;
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
create policy ingredients_public_read on public.ingredients for select to anon, authenticated using (true);

-- Both visibility and new ownership are constrained: user_id cannot be reassigned.
grant select, insert, update, delete on public.profiles, public.preferences,
  public.pantry_items, public.saved_recipes to authenticated;
create policy profiles_owner on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy preferences_owner on public.preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pantry_owner on public.pantry_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recipes_owner on public.saved_recipes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.shared_recipes to anon, authenticated;
grant insert, delete on public.shared_recipes to authenticated;
create policy shared_public_read on public.shared_recipes for select to anon, authenticated using (true);
create policy shared_owner_insert on public.shared_recipes for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy shared_owner_delete on public.shared_recipes for delete to authenticated
  using (created_by = (select auth.uid()));
-- Shares are immutable, public snapshots. Do not include private profile data.
commit;
