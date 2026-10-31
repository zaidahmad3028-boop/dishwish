-- Snapshot every existing public table into a separate schema before running 0005.
-- Run in SQL Editor as postgres. Safe: it only creates copies, it changes nothing in public.
-- Restore a table if ever needed: insert into public.<t> select * from backup_pre_0005.<t> on conflict do nothing;
-- Remove the snapshot later with: drop schema backup_pre_0005 cascade;
begin;
create schema if not exists backup_pre_0005;
revoke all on schema backup_pre_0005 from public, anon, authenticated;
create table backup_pre_0005.categories as select * from public.categories;
create table backup_pre_0005.ingredients as select * from public.ingredients;
create table backup_pre_0005.profiles as select * from public.profiles;
create table backup_pre_0005.preferences as select * from public.preferences;
create table backup_pre_0005.pantry_items as select * from public.pantry_items;
create table backup_pre_0005.saved_recipes as select * from public.saved_recipes;
create table backup_pre_0005.shared_recipes as select * from public.shared_recipes;
commit;
select 'categories' t, count(*) from backup_pre_0005.categories
union all select 'ingredients', count(*) from backup_pre_0005.ingredients
union all select 'profiles', count(*) from backup_pre_0005.profiles
union all select 'preferences', count(*) from backup_pre_0005.preferences
union all select 'pantry_items', count(*) from backup_pre_0005.pantry_items
union all select 'saved_recipes', count(*) from backup_pre_0005.saved_recipes
union all select 'shared_recipes', count(*) from backup_pre_0005.shared_recipes;
