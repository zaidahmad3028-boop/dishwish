-- 0010: let the saved engine settings include the TF-IDF "similarity" weight (added to the engine after 0005).
-- Only replaces the validation function used by the app_settings check; no row is changed. Safe to run twice.
create or replace function public.valid_recommendation_settings(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'object'
    and jsonb_typeof(v -> 'weights') = 'object'
    and (select bool_and(key in ('coverage','similarity','compatibility','taste','cooking') and jsonb_typeof(value) = 'number'
                         and value::text::numeric between 0 and 1) from jsonb_each(v -> 'weights'))
    and (select sum(value::text::numeric) from jsonb_each(v -> 'weights')) > 0
    and (v -> 'missing_penalty')::text::numeric between 0 and 0.2
    and (v -> 'missing_tolerance')::text::numeric between 0 and 10
    and (v -> 'min_score')::text::numeric between 0 and 1;
$$;
