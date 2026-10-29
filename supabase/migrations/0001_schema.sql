-- Run once in Supabase SQL Editor before 0002_rls.sql and seed.sql.
begin;

create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique check (btrim(name) <> '')
);

create function public.valid_allergens(tags text[]) returns boolean
language sql immutable set search_path = '' as $$
  select tags is not null and array_position(tags, null) is null
    and tags <@ array['milk','gluten','eggs','peanuts','tree_nuts','sesame',
                     'fish','shellfish','soy','mustard','legumes']::text[];
$$;

create table public.ingredients (
  id bigint generated always as identity primary key,
  name text not null unique check (btrim(name) <> ''),
  category_id bigint not null references public.categories(id),
  kcal numeric not null check (kcal >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  sweet smallint not null check (sweet between 0 and 10),
  salty smallint not null check (salty between 0 and 10),
  sour smallint not null check (sour between 0 and 10),
  spicy smallint not null check (spicy between 0 and 10),
  allergens text[] not null default '{}' check (public.valid_allergens(allergens)),
  priority smallint not null check (priority between 1 and 5)
);
comment on table public.ingredients is 'Nutrition per 100g as supplied in ingredients.csv; source accuracy is not independently verified.';
create index ingredients_category_idx on public.ingredients(category_id);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sweet text not null default 'medium' check (sweet in ('none','low','medium','high')),
  sour text not null default 'medium' check (sour in ('none','low','medium','high')),
  salty text not null default 'medium' check (salty in ('none','low','medium','high')),
  spicy text not null default 'medium' check (spicy in ('none','low','medium','high')),
  allergens text[] not null default '{}' check (public.valid_allergens(allergens)),
  calorie_tier text not null default 'medium' check (calorie_tier in ('low','medium','high'))
);
create table public.pantry_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id),
  quantity_g numeric not null default 0 check (quantity_g >= 0),
  primary key (user_id, ingredient_id)
);
create table public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  fingerprint text not null check (btrim(fingerprint) <> ''),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create table public.shared_recipes (
  token uuid primary key default gen_random_uuid(),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index shared_recipes_creator_idx on public.shared_recipes(created_by);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id);
  insert into public.preferences(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Protect tables in the same transaction that creates them.
alter table public.categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.pantry_items enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.shared_recipes enable row level security;
revoke all on table public.categories, public.ingredients, public.profiles,
  public.preferences, public.pantry_items, public.saved_recipes, public.shared_recipes
  from anon, authenticated;
commit;
