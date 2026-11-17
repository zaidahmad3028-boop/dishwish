-- 0009: Supabase Storage for images (recipe, ingredient and profile photos).
-- Additive only: creates one public-read bucket and the write rules for it. No table data is changed.
-- Safe to run more than once. Cloudflare R2 stays optional: when R2_* is set on the API it is used instead.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Super Admins may add and remove recipe and ingredient pictures.
drop policy if exists images_admin_insert on storage.objects;
create policy images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] in ('recipes', 'ingredients') and public.is_admin());

drop policy if exists images_admin_delete on storage.objects;
create policy images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] in ('recipes', 'ingredients') and public.is_admin());

-- Every signed-in, active user may add and remove only their own profile photo: avatars/<their id>-<random>.<ext>
drop policy if exists images_own_avatar_insert on storage.objects;
create policy images_own_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and name like 'avatars/' || (select auth.uid())::text || '-%' and public.is_active());

drop policy if exists images_own_avatar_delete on storage.objects;
create policy images_own_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and name like 'avatars/' || (select auth.uid())::text || '-%');

-- Reading the files goes through the public URL (the bucket is public), so no select policy is needed.
commit;
