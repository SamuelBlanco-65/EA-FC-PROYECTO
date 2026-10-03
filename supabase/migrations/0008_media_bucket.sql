-- Private Storage bucket for club crests and player photos.
-- Only PNG, max 1 MiB per object. No storage.objects policies are created on purpose: with RLS enabled
-- and no policy, anon/authenticated cannot read or write; only the backend (secret key) can.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 1048576, array['image/png'])
on conflict (id) do nothing;
