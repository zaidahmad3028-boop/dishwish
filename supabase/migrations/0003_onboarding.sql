-- Phase 1: auth + onboarding. Run once in SQL Editor after 0002_rls.sql, then
-- re-run seed/seed.sql so existing ingredients pick up the new allergen tags.
begin;

-- Extended allergen tags. The list only grows, so existing rows stay valid.
create or replace function public.valid_allergens(tags text[]) returns boolean
language sql immutable set search_path = '' as $$
  select tags is not null and array_position(tags, null) is null
    and tags <@ array['milk','gluten','eggs','peanuts','tree_nuts','sesame',
                     'fish','shellfish','soy','mustard','legumes','tomato',
                     'brinjal','mango','citrus','banana','strawberry','coconut','corn']::text[];
$$;

-- Free-text "not in the list" words: at most 20, each 1-40 characters.
create function public.valid_custom_allergens(words text[]) returns boolean
language sql immutable set search_path = '' as $$
  select words is not null and cardinality(words) <= 20 and array_position(words, null) is null
    and not exists (select 1 from unnest(words) as w where char_length(btrim(w)) not between 1 and 40);
$$;

-- Tastes are optional ('none' = not chosen); calorie goal is optional ('none').
-- Tiers: low = 1,200 kcal/day, medium = 1,500, high = 1,800.
alter table public.preferences
  alter column sweet set default 'none',
  alter column salty set default 'none',
  alter column sour set default 'none',
  alter column spicy set default 'none',
  drop constraint preferences_calorie_tier_check,
  add constraint preferences_calorie_tier_check check (calorie_tier in ('none','low','medium','high')),
  alter column calorie_tier set default 'none',
  add column custom_allergens text[] not null default '{}'
    check (public.valid_custom_allergens(custom_allergens)),
  add column onboarded boolean not null default false,
  add column updated_at timestamptz not null default now();

-- No onboarding UI existed before this migration, so no row holds a user's choice yet.
update public.preferences
  set sweet = 'none', salty = 'none', sour = 'none', spicy = 'none', calorie_tier = 'none'
  where not onboarded;

alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 30);

-- Copy the signup username (options.data.username) into the profile, trimmed and capped.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name)
    values (new.id, left(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')), 30));
  insert into public.preferences(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
commit;
