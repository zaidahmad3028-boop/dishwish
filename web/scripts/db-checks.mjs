// Applies every migration and seed to an in-memory Postgres (PGlite) and runs the SQL checks,
// with a minimal stand-in for Supabase's auth schema. Run from web/: npm run test:db
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const files = ['migrations/0001_schema.sql', 'migrations/0002_rls.sql', 'migrations/0003_onboarding.sql', 'seed/seed.sql',
  'migrations/0004_allergen_tags.sql', 'migrations/0005_admin_recipes.sql', 'seed/recipes.sql'];
const checks = ['tests/rls_check.sql', 'tests/admin_check.sql'];

const AUTH_STANDIN = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;`;
const db = new PGlite();
await db.exec(AUTH_STANDIN);
for (const f of files) await db.exec(readFileSync(join(root, f), 'utf8'));
// Seeds are idempotent: a second run must not change row counts.
const count = async () => (await db.query(`select (select count(*) from public.curated_recipes)::int r,
  (select count(*) from public.recipe_steps)::int s, (select count(*) from public.ingredient_compatibility)::int e`)).rows[0];
const before = await count();
await db.exec(readFileSync(join(root, 'seed/recipes.sql'), 'utf8'));
const after = await count();
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`recipes.sql is not idempotent: ${JSON.stringify([before, after])}`);
console.log(`seed: ${after.r} recipes, ${after.s} steps, ${after.e} edges (idempotent)`);

// Upgrade path of a live database seeded before migration 0006: old 8 categories -> 13 display categories.
const KIND = { 'Meat & Poultry': 'Meat', 'Fish & Seafood': 'Meat', 'Fresh Herbs': 'Vegetables', 'Dairy & Eggs': 'Dairy',
  'Grains & Flours': 'Grocery', 'Bakery & Baking': 'Grocery', 'Pulses & Lentils': 'Pulses & Nuts', 'Nuts, Seeds & Dry Fruits': 'Pulses & Nuts',
  'Spices & Masalas': 'Spices', 'Sauces & Condiments': 'Oils & Sauces', 'Oils, Ghee & Sweeteners': 'Oils & Sauces' };
const legacySeed = readFileSync(join(root, 'seed/seed.sql'), 'utf8').split('\n')
  .filter((l) => !l.includes("'Burger Buns (Bun)'"))
  .map((l) => l.replace(/(categories\(name\) values \('|categories where name = ')([^']+)'/g, (m, pre, g) => `${pre}${KIND[g] ?? g}'`))
  .join('\n');
const old = new PGlite();
await old.exec(AUTH_STANDIN);
for (const f of files) await old.exec(f === 'seed/seed.sql' ? legacySeed : readFileSync(join(root, f), 'utf8'));
const recipeLines = async () => (await old.query('select count(*)::int n from public.recipe_ingredients')).rows[0].n;
const linesBefore = await recipeLines();
for (let i = 0; i < 2; i++) await old.exec(readFileSync(join(root, 'migrations/0006_categories.sql'), 'utf8'));
const upgraded = (await old.query(`select (select count(*) from public.categories)::int cats,
  (select count(*) from public.ingredients)::int ings,
  (select count(*) from public.ingredients i join public.categories c on c.id = i.category_id
    where c.name in ('Meat','Dairy','Grocery','Spices','Pulses & Nuts','Oils & Sauces'))::int stale,
  (select c.name from public.ingredients i join public.categories c on c.id = i.category_id where i.name = 'Tomato Ketchup') ketchup`)).rows[0];
const upgradeOk = upgraded.cats === 13 && upgraded.ings === 261 && upgraded.stale === 0
  && upgraded.ketchup === 'Sauces & Condiments' && (await recipeLines()) === linesBefore;
console.log(`migrations/0006_categories.sql on an old database (run twice): ${upgradeOk ? 'PASS' : 'FAIL'} ${JSON.stringify(upgraded)}`);

let failed = !upgradeOk;
for (const f of checks) {
  try {
    const results = await db.exec(readFileSync(join(root, f), 'utf8'));
    const pass = results.flatMap((r) => r.rows).find((row) => String(row.result ?? '').startsWith('PASS'));
    console.log(`${f}: ${pass ? pass.result : 'no PASS row'}`);
    if (!pass) failed = true;
  } catch (err) {
    failed = true;
    console.error(`${f}: ${err.message}`);
    await db.exec('rollback').catch(() => {});
  }
}
process.exit(failed ? 1 : 0);
