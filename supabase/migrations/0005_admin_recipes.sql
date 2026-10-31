-- Phase 2: Super Admin role, curated recipes, compatibility graph, feedback, activity,
-- settings and audit log. Run once in SQL Editor after 0004, then run seed/recipes.sql.
-- Every admin capability is enforced here (RLS + security-definer RPCs that check
-- public.is_admin()), never only by hiding links in the web app.
begin;

-- ---------- Roles -----------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin')),
  granted_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'super_admin');
$$;
-- anon needs it too: public read policies call it (it is simply false without a session).
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Promote an existing account. SQL Editor / service role only, never from the browser.
create function public.grant_super_admin(target_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(btrim(target_email));
  if uid is null then raise exception 'No account with that email'; end if;
  insert into public.user_roles(user_id, role) values (uid, 'super_admin') on conflict (user_id) do nothing;
  return uid;
end;
$$;
revoke all on function public.grant_super_admin(text) from public, anon, authenticated;

-- ---------- Account status (admin-managed) and richer preferences ------------------------
alter table public.profiles
  add column status text not null default 'active' check (status in ('active', 'deactivated')),
  add column last_seen_at timestamptz;
-- Users may edit only their display name and activity stamp, never their status.
revoke update on public.profiles from authenticated;
grant update (display_name, last_seen_at) on public.profiles to authenticated;

create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select status = 'active' from public.profiles where user_id = (select auth.uid())), false);
$$;
revoke all on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;

alter table public.preferences
  add column diets text[] not null default '{}'
    check (diets <@ array['vegetarian','gluten_free','low_calorie','high_protein']::text[]),
  add column cuisines text[] not null default '{}' check (cardinality(cuisines) <= 10),
  add column max_minutes integer check (max_minutes between 5 and 480),
  add column notify jsonb not null default '{"tips": false, "feedback_replies": true}'::jsonb
    check (jsonb_typeof(notify) = 'object'),
  add column text_size text not null default 'normal' check (text_size in ('normal', 'large'));

-- Deactivated accounts lose access to their private data until an admin reactivates them.
drop policy preferences_owner on public.preferences;
create policy preferences_owner on public.preferences for all to authenticated
  using (user_id = (select auth.uid()) and public.is_active()) with check (user_id = (select auth.uid()) and public.is_active());
drop policy pantry_owner on public.pantry_items;
create policy pantry_owner on public.pantry_items for all to authenticated
  using (user_id = (select auth.uid()) and public.is_active()) with check (user_id = (select auth.uid()) and public.is_active());
drop policy recipes_owner on public.saved_recipes;
create policy recipes_owner on public.saved_recipes for all to authenticated
  using (user_id = (select auth.uid()) and public.is_active()) with check (user_id = (select auth.uid()) and public.is_active());

-- ---------- Admin-editable catalog -------------------------------------------------------
grant insert, update, delete on public.categories, public.ingredients to authenticated;
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ingredients_admin_write on public.ingredients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
alter table public.ingredients add column image_url text check (image_url is null or image_url ~ '^https://');

create table public.curated_recipes (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  category text not null check (category in ('Main Course','Rice','Lentils','Vegetables','Snacks','Breakfast','Desserts')),
  cuisine text not null default 'Pakistani' check (char_length(cuisine) between 1 and 40),
  minutes integer not null check (minutes between 1 and 600),
  servings integer not null check (servings between 1 and 20),
  taste jsonb not null check (jsonb_typeof(taste) = 'object'
    and (taste ->> 'sweet')::numeric between 0 and 10 and (taste ->> 'salty')::numeric between 0 and 10
    and (taste ->> 'sour')::numeric between 0 and 10 and (taste ->> 'spicy')::numeric between 0 and 10),
  image_url text check (image_url is null or image_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  source text not null default 'curated' check (source in ('curated', 'user_generated')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index curated_recipes_status_idx on public.curated_recipes(status, category);

create table public.recipe_ingredients (
  recipe_id bigint not null references public.curated_recipes(id) on delete cascade,
  ingredient_id bigint not null references public.ingredients(id) on delete restrict,
  position smallint not null check (position between 1 and 60),
  grams numeric not null check (grams > 0 and grams <= 10000),
  display text not null default '' check (char_length(display) <= 80),
  primary key (recipe_id, ingredient_id)
);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients(ingredient_id);

create table public.recipe_steps (
  recipe_id bigint not null references public.curated_recipes(id) on delete cascade,
  position smallint not null check (position between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 600),
  primary key (recipe_id, position)
);

-- One row per unordered pair (ingredient_a < ingredient_b). weight 0-1: 1 = pairs very well.
create table public.ingredient_compatibility (
  ingredient_a bigint not null references public.ingredients(id) on delete cascade,
  ingredient_b bigint not null references public.ingredients(id) on delete cascade,
  weight numeric not null check (weight between 0 and 1),
  relation_type text not null check (relation_type in ('co-occurrence', 'complementary', 'flavour-bridge', 'contrast', 'avoid')),
  evidence text not null default '' check (char_length(evidence) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (ingredient_a, ingredient_b),
  check (ingredient_a < ingredient_b)
);
create index ingredient_compatibility_b_idx on public.ingredient_compatibility(ingredient_b);

alter table public.curated_recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.ingredient_compatibility enable row level security;
revoke all on public.curated_recipes, public.recipe_ingredients, public.recipe_steps, public.ingredient_compatibility from anon, authenticated;
grant select on public.curated_recipes, public.recipe_ingredients, public.recipe_steps, public.ingredient_compatibility to anon, authenticated;
grant insert, update, delete on public.curated_recipes, public.recipe_ingredients, public.recipe_steps, public.ingredient_compatibility to authenticated;
create policy curated_read on public.curated_recipes for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy curated_admin on public.curated_recipes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy recipe_ingredients_read on public.recipe_ingredients for select to anon, authenticated
  using (exists (select 1 from public.curated_recipes r where r.id = recipe_id and (r.status = 'published' or public.is_admin())));
create policy recipe_ingredients_admin on public.recipe_ingredients for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy recipe_steps_read on public.recipe_steps for select to anon, authenticated
  using (exists (select 1 from public.curated_recipes r where r.id = recipe_id and (r.status = 'published' or public.is_admin())));
create policy recipe_steps_admin on public.recipe_steps for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy compatibility_read on public.ingredient_compatibility for select to anon, authenticated using (true);
create policy compatibility_admin on public.ingredient_compatibility for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Application settings ---------------------------------------------------------
create function public.valid_recommendation_settings(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'object'
    and jsonb_typeof(v -> 'weights') = 'object'
    and (select bool_and(key in ('coverage','compatibility','taste','cooking') and jsonb_typeof(value) = 'number'
                         and value::text::numeric between 0 and 1) from jsonb_each(v -> 'weights'))
    and (select sum(value::text::numeric) from jsonb_each(v -> 'weights')) > 0
    and (v -> 'missing_penalty')::text::numeric between 0 and 0.2
    and (v -> 'missing_tolerance')::text::numeric between 0 and 10
    and (v -> 'min_score')::text::numeric between 0 and 1;
$$;

create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (key <> 'recommendation' or public.valid_recommendation_settings(value))
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
create policy settings_public_read on public.app_settings for select to anon, authenticated using (is_public or public.is_admin());
create policy settings_admin_write on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Feedback ---------------------------------------------------------------------
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  kind text not null check (kind in ('rating', 'suggestion', 'complaint', 'bug')),
  rating smallint check (rating between 1 and 5),
  subject text not null default '' check (char_length(subject) <= 120),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  recipe_slug text check (recipe_slug is null or recipe_slug ~ '^[a-z0-9-]{1,80}$'),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (kind <> 'rating' or rating is not null)
);
create index feedback_status_idx on public.feedback(status, created_at desc);
create index feedback_user_idx on public.feedback(user_id);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (kind, rating, subject, message, recipe_slug) on public.feedback to authenticated;
grant update (status, admin_note) on public.feedback to authenticated;
create policy feedback_owner_read on public.feedback for select to authenticated
  using ((user_id = (select auth.uid()) and public.is_active()) or public.is_admin());
create policy feedback_owner_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active());
create policy feedback_admin_update on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Activity (history and analytics) ---------------------------------------------
create table public.recipe_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('generated', 'viewed', 'saved', 'cooked')),
  recipe_slug text check (recipe_slug is null or recipe_slug ~ '^[a-z0-9-]{1,80}$'),
  recipe_name text not null check (char_length(btrim(recipe_name)) between 1 and 120),
  match_percent smallint check (match_percent between 0 and 100),
  ingredients text[] not null default '{}' check (cardinality(ingredients) <= 20),
  created_at timestamptz not null default now()
);
create index recipe_events_user_idx on public.recipe_events(user_id, created_at desc);
create index recipe_events_time_idx on public.recipe_events(created_at, kind);
alter table public.recipe_events enable row level security;
revoke all on public.recipe_events from anon, authenticated;
grant select, delete on public.recipe_events to authenticated;
grant insert (kind, recipe_slug, recipe_name, match_percent, ingredients) on public.recipe_events to authenticated;
create policy events_owner_read on public.recipe_events for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active());
create policy events_owner_insert on public.recipe_events for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active());
create policy events_owner_delete on public.recipe_events for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_active());

-- ---------- Audit log (written only by triggers and admin RPCs) -------------------------
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_time_idx on public.admin_audit_log(created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
create policy audit_admin_read on public.admin_audit_log for select to authenticated using (public.is_admin());

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.admin_audit_log(actor, action, entity, entity_id, details)
  values ((select auth.uid()), lower(tg_op), tg_table_name,
          coalesce(row_data ->> 'id', row_data ->> 'slug', row_data ->> 'key',
                   concat_ws(':', row_data ->> 'ingredient_a', row_data ->> 'ingredient_b', row_data ->> 'recipe_id')),
          jsonb_strip_nulls(jsonb_build_object('name', coalesce(row_data ->> 'name', row_data ->> 'slug', row_data ->> 'key'),
                                               'status', row_data ->> 'status', 'weight', row_data -> 'weight')));
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;
-- Only actions taken by a signed-in user are audited (seed runs from SQL Editor have no auth.uid()).
create trigger audit_ingredients after insert or update or delete on public.ingredients
  for each row when (auth.uid() is not null) execute function public.audit_row();
create trigger audit_categories after insert or update or delete on public.categories
  for each row when (auth.uid() is not null) execute function public.audit_row();
create trigger audit_curated after insert or update or delete on public.curated_recipes
  for each row when (auth.uid() is not null) execute function public.audit_row();
create trigger audit_compatibility after insert or update or delete on public.ingredient_compatibility
  for each row when (auth.uid() is not null) execute function public.audit_row();
create trigger audit_settings after insert or update or delete on public.app_settings
  for each row when (auth.uid() is not null) execute function public.audit_row();
create trigger audit_feedback after update on public.feedback
  for each row when (auth.uid() is not null) execute function public.audit_row();

create function public.touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'feedback' then
    new.resolved_at := case when new.status = 'resolved' then coalesce(old.resolved_at, now()) end;
  end if;
  return new;
end;
$$;
create trigger touch_curated before update on public.curated_recipes for each row execute function public.touch_updated();
create trigger touch_feedback before update on public.feedback for each row execute function public.touch_updated();
create trigger touch_compatibility before update on public.ingredient_compatibility for each row execute function public.touch_updated();
create trigger touch_settings before update on public.app_settings for each row execute function public.touch_updated();

-- ---------- Account RPCs -----------------------------------------------------------------
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', case when public.is_admin() then 'super_admin' else 'user' end,
    'status', coalesce((select status from public.profiles where user_id = (select auth.uid())), 'active'));
$$;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- Self-service deletion. The app re-checks the password first; super admins cannot delete themselves.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if public.is_admin() then raise exception 'A Super Admin account cannot be deleted from the app' using errcode = '42501'; end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Admin RPCs (each checks is_admin and raises 42501 otherwise) -----------------
create function public.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.require_admin() from public, anon, authenticated;

create function public.admin_overview(days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(days, 365)));
        prev timestamptz := now() - make_interval(days => 2 * greatest(1, least(days, 365)));
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users', (select count(*) from public.profiles where created_at >= since),
    'new_users_prev', (select count(*) from public.profiles where created_at >= prev and created_at < since),
    'active_users', (select count(distinct user_id) from public.recipe_events where created_at >= since),
    'deactivated_users', (select count(*) from public.profiles where status = 'deactivated'),
    'total_ingredients', (select count(*) from public.ingredients),
    'total_recipes', (select count(*) from public.curated_recipes where status = 'published'),
    'draft_recipes', (select count(*) from public.curated_recipes where status = 'draft'),
    'generations', (select count(*) from public.recipe_events where kind = 'generated' and created_at >= since),
    'generations_prev', (select count(*) from public.recipe_events where kind = 'generated' and created_at >= prev and created_at < since),
    'saves', (select count(*) from public.recipe_events where kind = 'saved' and created_at >= since),
    'views', (select count(*) from public.recipe_events where kind = 'viewed' and created_at >= since),
    'cooked', (select count(*) from public.recipe_events where kind = 'cooked' and created_at >= since),
    'avg_rating', (select round(avg(rating)::numeric, 2) from public.feedback where rating is not null),
    'ratings', (select count(*) from public.feedback where rating is not null),
    'open_feedback', (select count(*) from public.feedback where status <> 'resolved'),
    'edges', (select count(*) from public.ingredient_compatibility));
end;
$$;

create function public.admin_timeseries(days integer default 30) returns table(day date, new_users bigint, active_users bigint, generations bigint, views bigint, saves bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select d::date,
      (select count(*) from public.profiles p where p.created_at::date = d::date),
      (select count(distinct e.user_id) from public.recipe_events e where e.created_at::date = d::date),
      (select count(*) from public.recipe_events e where e.kind = 'generated' and e.created_at::date = d::date),
      (select count(*) from public.recipe_events e where e.kind = 'viewed' and e.created_at::date = d::date),
      (select count(*) from public.recipe_events e where e.kind = 'saved' and e.created_at::date = d::date)
    from generate_series(current_date - (greatest(1, least(days, 365)) - 1), current_date, interval '1 day') as d
    order by 1;
end;
$$;

create function public.admin_top_ingredients(days integer default 30, lim integer default 8) returns table(name text, uses bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select i.name, count(*) from public.recipe_events e, unnest(e.ingredients) as i(name)
    where e.kind = 'generated' and e.created_at >= now() - make_interval(days => greatest(1, least(days, 365)))
    group by i.name order by 2 desc, 1 limit greatest(1, least(lim, 50));
end;
$$;

create function public.admin_top_recipes(days integer default 30, lim integer default 8)
returns table(recipe_slug text, recipe_name text, generated bigint, viewed bigint, saved bigint, cooked bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select e.recipe_slug, max(e.recipe_name),
      count(*) filter (where e.kind = 'generated'), count(*) filter (where e.kind = 'viewed'),
      count(*) filter (where e.kind = 'saved'), count(*) filter (where e.kind = 'cooked')
    from public.recipe_events e
    where e.created_at >= now() - make_interval(days => greatest(1, least(days, 365)))
    group by e.recipe_slug order by count(*) desc, 2 limit greatest(1, least(lim, 50));
end;
$$;

create function public.admin_category_usage(days integer default 30) returns table(category text, recipes bigint, uses bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select r.category, count(distinct r.id),
      (select count(*) from public.recipe_events e join public.curated_recipes r2 on r2.slug = e.recipe_slug
       where r2.category = r.category and e.created_at >= now() - make_interval(days => greatest(1, least(days, 365))))
    from public.curated_recipes r where r.status = 'published' group by r.category order by 3 desc, 1;
end;
$$;

create function public.admin_preference_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'tastes', (select jsonb_object_agg(t, jsonb_build_object('low', lo, 'medium', me, 'high', hi)) from (
      select 'sweet' t, count(*) filter (where sweet = 'low') lo, count(*) filter (where sweet = 'medium') me, count(*) filter (where sweet = 'high') hi from public.preferences
      union all select 'salty', count(*) filter (where salty = 'low'), count(*) filter (where salty = 'medium'), count(*) filter (where salty = 'high') from public.preferences
      union all select 'sour', count(*) filter (where sour = 'low'), count(*) filter (where sour = 'medium'), count(*) filter (where sour = 'high') from public.preferences
      union all select 'spicy', count(*) filter (where spicy = 'low'), count(*) filter (where spicy = 'medium'), count(*) filter (where spicy = 'high') from public.preferences) s),
    'diets', (select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) from (select d, count(*) n from public.preferences, unnest(diets) d group by d) s),
    'cuisines', (select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (select c, count(*) n from public.preferences, unnest(cuisines) c group by c) s),
    'allergens', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb) from (select a, count(*) n from public.preferences, unnest(allergens) a group by a) s),
    'onboarded', (select count(*) from public.preferences where onboarded));
end;
$$;

create function public.admin_list_users(search text default '', status_filter text default '', page integer default 1, page_size integer default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(btrim(coalesce(search, ''))); size integer := greatest(1, least(page_size, 50));
begin
  perform public.require_admin();
  return (
    with base as (
      select p.user_id, p.display_name, u.email, p.created_at, p.status,
        greatest(p.last_seen_at, (select max(e.created_at) from public.recipe_events e where e.user_id = p.user_id)) as last_active,
        (select count(*) from public.saved_recipes s where s.user_id = p.user_id) as saved,
        (select count(*) from public.recipe_events e where e.user_id = p.user_id and e.kind = 'generated') as generated,
        exists (select 1 from public.user_roles r where r.user_id = p.user_id) as is_admin
      from public.profiles p join auth.users u on u.id = p.user_id
      where (q = '' or lower(p.display_name) like '%' || q || '%' or lower(u.email) like '%' || q || '%')
        and (coalesce(status_filter, '') = '' or p.status = status_filter
             or (status_filter = 'admin' and exists (select 1 from public.user_roles r where r.user_id = p.user_id))))
    select jsonb_build_object('total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from
        (select * from base order by created_at desc offset (greatest(page, 1) - 1) * size limit size) b), '[]'::jsonb)));
end;
$$;

create function public.admin_set_user_status(target uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if new_status not in ('active', 'deactivated') then raise exception 'Invalid status'; end if;
  if target = (select auth.uid()) then raise exception 'You cannot change your own status' using errcode = '42501'; end if;
  if exists (select 1 from public.user_roles where user_id = target) then
    raise exception 'Super Admin accounts are protected' using errcode = '42501';
  end if;
  update public.profiles set status = new_status where user_id = target;
  if not found then raise exception 'User not found'; end if;
  insert into public.admin_audit_log(actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'set_status', 'profiles', target::text, jsonb_build_object('status', new_status));
end;
$$;

create function public.admin_list_feedback(search text default '', status_filter text default '', kind_filter text default '', page integer default 1, page_size integer default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(btrim(coalesce(search, ''))); size integer := greatest(1, least(page_size, 50));
begin
  perform public.require_admin();
  return (
    with base as (
      select f.*, coalesce(nullif(p.display_name, ''), 'Deleted account') as author
      from public.feedback f left join public.profiles p on p.user_id = f.user_id
      where (q = '' or lower(f.message) like '%' || q || '%' or lower(f.subject) like '%' || q || '%')
        and (coalesce(status_filter, '') = '' or f.status = status_filter)
        and (coalesce(kind_filter, '') = '' or f.kind = kind_filter))
    select jsonb_build_object('total', (select count(*) from base),
      'counts', (select jsonb_build_object('open', count(*) filter (where status = 'open'),
                 'in_progress', count(*) filter (where status = 'in_progress'), 'resolved', count(*) filter (where status = 'resolved'))
                 from public.feedback),
      'rows', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.created_at desc) from
        (select * from base order by created_at desc offset (greatest(page, 1) - 1) * size limit size) b), '[]'::jsonb)));
end;
$$;

create function public.admin_ingredient_usage() returns table(ingredient_id bigint, recipes bigint, pantries bigint, edges bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select i.id,
      (select count(*) from public.recipe_ingredients ri where ri.ingredient_id = i.id),
      (select count(*) from public.pantry_items pi where pi.ingredient_id = i.id),
      (select count(*) from public.ingredient_compatibility c where c.ingredient_a = i.id or c.ingredient_b = i.id)
    from public.ingredients i;
end;
$$;

create function public.admin_system_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'database', 'ok', 'server_time', now(), 'postgres_version', current_setting('server_version'),
    'database_size_bytes', pg_database_size(current_database()),
    'admins', (select count(*) from public.user_roles),
    'tables', jsonb_build_object(
      'profiles', (select count(*) from public.profiles), 'ingredients', (select count(*) from public.ingredients),
      'curated_recipes', (select count(*) from public.curated_recipes), 'ingredient_compatibility', (select count(*) from public.ingredient_compatibility),
      'pantry_items', (select count(*) from public.pantry_items), 'saved_recipes', (select count(*) from public.saved_recipes),
      'feedback', (select count(*) from public.feedback), 'recipe_events', (select count(*) from public.recipe_events),
      'admin_audit_log', (select count(*) from public.admin_audit_log)),
    'rls_disabled', (select coalesce(jsonb_agg(tablename), '[]'::jsonb) from pg_tables where schemaname = 'public' and not rowsecurity));
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['admin_overview(integer)', 'admin_timeseries(integer)', 'admin_top_ingredients(integer, integer)',
    'admin_top_recipes(integer, integer)', 'admin_category_usage(integer)', 'admin_preference_stats()',
    'admin_list_users(text, text, integer, integer)', 'admin_set_user_status(uuid, text)',
    'admin_list_feedback(text, text, text, integer, integer)', 'admin_ingredient_usage()', 'admin_system_status()'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

insert into public.app_settings(key, value, is_public) values
  ('recommendation', '{"weights": {"coverage": 0.45, "compatibility": 0.30, "taste": 0.20, "cooking": 0.05},
                       "missing_penalty": 0.03, "missing_tolerance": 3, "min_score": 0.20}'::jsonb, true),
  ('general', '{"announcement": ""}'::jsonb, true)
on conflict (key) do nothing;
commit;
