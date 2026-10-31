-- Demo data for a development/demo project. Run in SQL Editor AFTER creating these accounts in
-- Authentication → Users → Add user (tick "Auto Confirm User"):
--   admin@example.com (replace every occurrence below with your admin's email) → becomes Super Admin
--   demo.cook1@dishwish.test … demo.cook5@dishwish.test → registered users with sample activity
-- Idempotent: safe to re-run; it only adds rows that are missing. Accounts that don't exist are skipped.
-- Contains no real personal data: display names are generic placeholders.
begin;

-- 1. Super Admin role (no password or auth change, only a role row).
insert into public.user_roles(user_id, role)
select id, 'super_admin' from auth.users where lower(email) = 'admin@example.com'
on conflict (user_id) do nothing;
update public.profiles p set display_name = 'Admin'
from auth.users u where u.id = p.user_id and lower(u.email) = 'admin@example.com' and p.display_name = '';

-- 2. Demo cooks: names, preferences and onboarding.
with demo(email, name, spicy, sweet, allergens, diets, max_minutes) as (values
  ('demo.cook1@dishwish.test', 'Demo Cook 1', 'high',   'low',    array[]::text[],          array[]::text[],                 45),
  ('demo.cook2@dishwish.test', 'Demo Cook 2', 'medium', 'medium', array['milk']::text[],    array['vegetarian']::text[],     30),
  ('demo.cook3@dishwish.test', 'Demo Cook 3', 'high',   'none',   array['shellfish']::text[], array['high_protein']::text[], 60),
  ('demo.cook4@dishwish.test', 'Demo Cook 4', 'low',    'high',   array['peanuts','tree_nuts']::text[], array[]::text[],     null),
  ('demo.cook5@dishwish.test', 'Demo Cook 5', 'medium', 'none',   array['gluten']::text[],  array['gluten_free']::text[],    40)
), users as (
  select u.id, d.* from demo d join auth.users u on lower(u.email) = d.email
), names as (
  update public.profiles p set display_name = users.name from users where p.user_id = users.id and p.display_name = '' returning p.user_id
)
update public.preferences pr set spicy = users.spicy, sweet = users.sweet, allergens = users.allergens, diets = users.diets,
  max_minutes = users.max_minutes, cuisines = array['Pakistani'], onboarded = true, updated_at = now()
from users where pr.user_id = users.id and not pr.onboarded;

-- 3. Pantry items.
insert into public.pantry_items(user_id, ingredient_id, quantity_g)
select u.id, i.id, v.grams
from (values
  ('demo.cook1@dishwish.test', 'Chicken Breast', 1000), ('demo.cook1@dishwish.test', 'Tomato', 600), ('demo.cook1@dishwish.test', 'Onion', 800),
  ('demo.cook1@dishwish.test', 'Garlic', 80), ('demo.cook1@dishwish.test', 'Green Chilli', 60),
  ('demo.cook2@dishwish.test', 'Potato', 1500), ('demo.cook2@dishwish.test', 'Cauliflower', 700), ('demo.cook2@dishwish.test', 'Spinach', 400),
  ('demo.cook2@dishwish.test', 'Masoor Dal', 500),
  ('demo.cook3@dishwish.test', 'Mutton', 750), ('demo.cook3@dishwish.test', 'Ginger', 90), ('demo.cook3@dishwish.test', 'Tomato', 50),
  ('demo.cook4@dishwish.test', 'Milk', 2000), ('demo.cook4@dishwish.test', 'Basmati Rice', 1000), ('demo.cook4@dishwish.test', 'Carrot', 1000),
  ('demo.cook5@dishwish.test', 'Kabuli Chickpeas (Chana)', 500), ('demo.cook5@dishwish.test', 'Onion', 300), ('demo.cook5@dishwish.test', 'Eggs', 600)
) as v(email, ingredient, grams)
join auth.users u on lower(u.email) = v.email
join public.ingredients i on i.name = v.ingredient
on conflict (user_id, ingredient_id) do nothing;

-- 4. Saved curated recipes (one favourite each).
insert into public.saved_recipes(user_id, title, fingerprint, data, favorite)
select u.id, r.name, 'curated:' || r.slug,
  jsonb_build_object('kind', 'curated', 'slug', r.slug, 'title', r.name, 'category', r.category, 'minutes', r.minutes,
                     'servings', r.servings, 'fingerprint', 'curated:' || r.slug), v.fav
from (values
  ('demo.cook1@dishwish.test', 'chicken-karahi', true), ('demo.cook1@dishwish.test', 'chicken-biryani', false),
  ('demo.cook2@dishwish.test', 'aloo-gobi', true), ('demo.cook2@dishwish.test', 'masoor-daal', false),
  ('demo.cook3@dishwish.test', 'mutton-karahi', true), ('demo.cook4@dishwish.test', 'kheer', true),
  ('demo.cook4@dishwish.test', 'gajar-halwa', false), ('demo.cook5@dishwish.test', 'chana-masala', true)
) as v(email, slug, fav)
join auth.users u on lower(u.email) = v.email
join public.curated_recipes r on r.slug = v.slug
on conflict (user_id, fingerprint) do nothing;

-- 5. Activity over the last two weeks (drives history, trending and admin analytics). Added once per cook.
insert into public.recipe_events(user_id, kind, recipe_slug, recipe_name, match_percent, ingredients, created_at)
select u.id, v.kind, r.slug, r.name, v.pct, v.ingredients, now() - make_interval(days => v.days_ago, hours => v.days_ago * 3)
from (values
  ('demo.cook1@dishwish.test', 'generated', 'chicken-karahi', 62, array['Chicken Breast','Tomato'], 12),
  ('demo.cook1@dishwish.test', 'viewed',    'chicken-karahi', 62, array['Chicken Breast','Tomato'], 12),
  ('demo.cook1@dishwish.test', 'cooked',    'chicken-karahi', 62, array['Chicken Breast','Tomato'], 11),
  ('demo.cook1@dishwish.test', 'generated', 'chicken-biryani', 48, array['Chicken Breast','Onion'], 4),
  ('demo.cook2@dishwish.test', 'generated', 'aloo-gobi', 58, array['Potato','Cauliflower'], 9),
  ('demo.cook2@dishwish.test', 'viewed',    'aloo-gobi', 58, array['Potato','Cauliflower'], 9),
  ('demo.cook2@dishwish.test', 'generated', 'masoor-daal', 51, array['Masoor Dal','Tomato'], 2),
  ('demo.cook3@dishwish.test', 'generated', 'mutton-karahi', 55, array['Mutton','Tomato'], 7),
  ('demo.cook3@dishwish.test', 'cooked',    'mutton-karahi', 55, array['Mutton','Tomato'], 6),
  ('demo.cook4@dishwish.test', 'generated', 'kheer', 60, array['Milk','Basmati Rice'], 5),
  ('demo.cook4@dishwish.test', 'viewed',    'gajar-halwa', 57, array['Milk','Carrot'], 3),
  ('demo.cook5@dishwish.test', 'generated', 'chana-masala', 53, array['Kabuli Chickpeas (Chana)','Onion'], 1),
  ('demo.cook5@dishwish.test', 'viewed',    'chana-masala', 53, array['Kabuli Chickpeas (Chana)','Onion'], 1)
) as v(email, kind, slug, pct, ingredients, days_ago)
join auth.users u on lower(u.email) = v.email
join public.curated_recipes r on r.slug = v.slug
where not exists (select 1 from public.recipe_events e where e.user_id = u.id);

-- 6. Feedback for the admin Feedback page (added once per cook).
insert into public.feedback(user_id, kind, rating, subject, message, recipe_slug, status, admin_note)
select u.id, v.kind, v.rating, v.subject, v.message, v.slug, v.status, v.note
from (values
  ('demo.cook1@dishwish.test', 'rating', 5, 'Great match', 'Chicken Karahi matched exactly what I had at home.', 'chicken-karahi', 'resolved', 'Thanks for the review!'),
  ('demo.cook2@dishwish.test', 'suggestion', 4, 'More daal', 'Please add more daal recipes like Haleem.', null, 'open', ''),
  ('demo.cook3@dishwish.test', 'bug', null, 'Search', 'Searching "qeema" shows chicken and beef together.', null, 'in_progress', 'Looking into grouping by meat type.'),
  ('demo.cook4@dishwish.test', 'rating', 4, 'Nice desserts', 'Kheer steps were easy to follow.', 'kheer', 'open', ''),
  ('demo.cook5@dishwish.test', 'complaint', 2, 'Too few gluten-free snacks', 'Gluten-free filter leaves very few snacks.', null, 'open', '')
) as v(email, kind, rating, subject, message, slug, status, note)
join auth.users u on lower(u.email) = v.email
where not exists (select 1 from public.feedback f where f.user_id = u.id);

commit;

select u.email, coalesce(p.display_name, '') as name, exists (select 1 from public.user_roles r where r.user_id = u.id) as super_admin,
  (select count(*) from public.pantry_items x where x.user_id = u.id) as pantry,
  (select count(*) from public.saved_recipes x where x.user_id = u.id) as saved,
  (select count(*) from public.recipe_events x where x.user_id = u.id) as events,
  (select count(*) from public.feedback x where x.user_id = u.id) as feedback
from auth.users u left join public.profiles p on p.user_id = u.id
where lower(u.email) = 'admin@example.com' or u.email like 'demo.cook%@dishwish.test'
order by u.email;
